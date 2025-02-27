"use client";
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import React from 'react';
import { redirect, useRouter } from 'next/navigation';
import { useEffect, useState } from "react";

// Add helper function for table cell content
const stringifyContent = (content: any): React.ReactNode => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(stringifyContent);
  if (React.isValidElement(content)) return content;
  if (typeof content === 'object' && content !== null) return stringifyContent(Object.values(content));
  if (content === undefined) return String("");
  return String(content);
};

const renderTableCell = (props: any, isHeader:boolean) => {
  const content = stringifyContent(props.children);
  return React.createElement(
    props.isHeader ? 'th' : 'td',
    {
      ...props,
      style: {
        ...props.style,
        minWidth: '150px',
        padding: '8px',
        boxSizing: 'border-box',
        border: '5px solid #e5e7eb',
        borderCollapse: 'collapse',
        backgroundColor: isHeader ? '#e5e7eb' : 'transparent', // Gray background for headers
        fontWeight: isHeader ? '600' : 'normal', // Optional: make header text bold
      },
    },
    React.Children.map(content, child => 
      typeof child === 'string' ? child.replace(/<br>/g, '\n') : child
    )
  );
};

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/themes/prism.css';

// Dynamically import PDF components with ssr disabled
const PDFDocument = dynamic(() => import('react-pdf').then(mod => mod.Document), {
  ssr: false
});

const PDFPage = dynamic(() => import('react-pdf').then(mod => mod.Page), {
  ssr: false
});

// Move this to a useEffect
const setPDFWorker = async () => {
  const { pdfjs } = await import('react-pdf');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
};

export default  function Home() {
    const [result, setResult] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const router = useRouter();
    const [questionsByYear, setQuestionsByYear] = useState<{ [key: number]: any[] }>({});
    const [years, setYears] = useState<number[]>([]);
    
    useEffect(() => {
      async function fetchQuestions() {
        try {
          const response = await fetch('/api/questions');
          const data = await response.json();
          
          // Organize questions by year, only including those with rubrics
          const questionsByYearMap = data.reduce((acc: { [key: number]: any[] }, question: any) => {
            // Skip questions without a rubric
            if (!question.rubric) return acc;
            
            if (!acc[question.year]) {
              acc[question.year] = [];
            }
            acc[question.year].push({
              description: question.description,
              path: question.path,
              rubric: question.rubric,
              open_ai_file_id: question.open_ai_file_id,
              id: question.id
            });
            return acc;
          }, {});
          
          setQuestionsByYear(questionsByYearMap);
          // Set years array from the available years, sorted in ascending order
          setYears(Object.keys(questionsByYearMap).map(Number).sort((a, b) => a - b));
        } catch (error) {
          console.error('Error fetching questions:', error);
        }
      }

      async function checkAuth() {
        const supabase = createClient();
        const { data, error } = await supabase.auth.getUser()
        if (error || !data?.user) {
          redirect('/')
        }
      }
      checkAuth();
      fetchQuestions();
    }, []);

    const [selectedYear, setSelectedYear] = useState<string>("");
    const [questions, setQuestions] = useState<any[]>([]);
    const [selectedQuestion, setSelectedQuestion] = useState<string>("");
    const [numPages, setNumPages] = useState<number>();
  
    const [code, setCode] = useState(
      `function add(a, b) {\n  return a + b;\n}`
    );
    const [selectedQuestionObj, setSelectedQuestionObj] = useState<any>(null);
  
    // Add cleanup for PDF rendering
    useEffect(() => {
      return () => {
        // Cleanup function to handle unmounting
        setNumPages(undefined);
      
      };
    }, [selectedQuestion]);

    function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
      setNumPages(numPages);
    }
  
    function onDocumentLoadError(error: Error): void {
      console.log('PDF load error:', error);
      // Optionally set an error state here if you want to show it to the user
    }
  
    const handleYearChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
      const year = parseInt(event.target.value);
      setSelectedYear(year.toString());
      setQuestions(questionsByYear[year] || [{}]);
      setSelectedQuestion("");
    };
  
    const handleQuestionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
      const questionPath = event.target.value;
      const selectedQ = questions.find(q => q.path === questionPath);
      setSelectedQuestionObj(selectedQ);
      setSelectedQuestion(questionPath);
  
    };
  
  // Set up PDF worker
  useEffect(() => {
    setPDFWorker();
  }, []);
  function handleClick(){
    fetchPdfAndAnalyze();
  }

  async function fetchPdfAndAnalyze() {
    setIsLoading(true);
    try {
      const fullPath = `${selectedQuestionObj.rubric}`;
      const serverPath = `${window.location.origin}`;
      const id = selectedQuestionObj.id;
      const openAiFileId = selectedQuestionObj.open_ai_file_id;

      const formData = new FormData();
      formData.append('filePath', fullPath);
      formData.append("code", code);
      formData.append("serverPath", serverPath);
      formData.append("id", id);
      formData.append("openAiFileId", openAiFileId);
      
      const response = await fetch('/api/ai', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response:', errorText);
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }
      console.log(data);
      setResult(data.content);
    } catch (error) {
      console.error('Error:', error);
      setResult(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
    } finally {
      setIsLoading(false);
    }
  }

  const handleLogout = async () => {
    try {
      const response = await fetch('/auth/logout', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        router.push('/');
      } else {
        setErrorMessage('Failed to logout. Please try again.');
      }
    } catch (error) {
      console.error('Error logging out:', error);
      setErrorMessage('An error occurred while logging out');
    }
  };

  return (
    <div className="grid grid-rows-[1fr] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family:var(--font-geist-sans)]">
      {errorMessage && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <span className="block sm:inline">{errorMessage}</span>
          <span className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setErrorMessage('')}>
            <svg className="fill-current h-6 w-6 text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <title>Close</title>
              <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/>
            </svg>
          </span>
        </div>
      )}
      <button
        onClick={handleLogout}
        className="absolute top-4 right-4 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        Logout
      </button>
      {isLoading ? (
        <div className="flex items-center justify-center w-full h-full mt-20">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
        </div>
      ) : result ? (
        <div className="flex flex-col gap-4 w-[80vw]">
          <ScrollArea className="border-4 border-gray-500 p-4 mt-20 w-full">
            <div className="p-4 rounded-lg w-full max-w-4xl">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  td: props => renderTableCell({ ...props}, false ),
                  th: props => renderTableCell({ ...props}, true )
                }}
              >
                {result}
              </ReactMarkdown>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
          
          <div className="flex space-x-4">
            <button 
              className="bg-blue-500 text-white p-2 rounded-md"
              onClick={() => setResult('')}
            >
              Back to Editor
            </button>
            <button 
              className="bg-green-500 text-white p-2 rounded-md"
              onClick={async () => {
                setIsLoading(true);
                try {
                  const formData = new FormData();
                  formData.append('code', code);
                  formData.append('previousGrade', result);
                  formData.append('filePath', selectedQuestionObj.rubric);
                  formData.append('serverPath', window.location.origin);
                  formData.append('id', selectedQuestionObj.id);
                  formData.append('openaiFileId',selectedQuestionObj.open_ai_file_id);

                  const response = await fetch('/api/ai/corrections', {
                    method: 'POST',
                    body: formData,
                  });
                  
                  if (!response.ok) throw new Error('Failed to get corrections');
                  
                  const data = await response.json();
                  setResult(data.content);
                } catch (error) {
                  console.error('Error:', error);
                  setResult(`Error getting corrections: ${error instanceof Error ? error.message : 'Unknown error'}`);
                } finally {
                  setIsLoading(false);
                }
              }}
            >
              Fix My Code
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex space-x-4">
            <select
              className="border border-gray-300 rounded-md p-2"
              value={selectedYear}
              onChange={handleYearChange}
            >
              <option value="" disabled>
                Select a year
              </option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <select
              className="border border-gray-300 rounded-md p-2"
              value={selectedQuestion}
              onChange={handleQuestionChange}
              disabled={!selectedYear || !questions.length}
            >
              <option value="" disabled>
                Select a question
              </option>
              {questions.map((question, index) => (
                <option key={index} value={question.path}>
                  {question.description}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col space-y-4">
            <ScrollArea 
              className="border-4 border-gray-500 p-4"
              style={{ maxHeight: '60vh', width: '80vw', overflow: 'auto' }}
            >
               <ScrollBar orientation="horizontal" />
                 <PDFDocument 
                  file={selectedQuestion ? encodeURIComponent(selectedQuestion) : undefined} 
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  loading={<div>Loading PDF...</div>}
                  error={<div>Error loading PDF!</div>}
                >
                  {Array.from(new Array(numPages), (el, index) => (
                    <div key={`page_container_${index + 1}`} className="mb-4 last:mb-0">
                      <PDFPage 
                        key={`page_${index + 1}`} 
                        pageNumber={index + 1} 
                        scale={1.5}
                        loading={<div>Loading page...</div>}
                        error={<div>Error loading page!</div>}
                      />
                      {numPages && index < numPages - 1 && <hr className="border-t-2 border-gray-300 my-4" />}
                    </div>
                  ))}
                </PDFDocument>
               
            </ScrollArea>
            <ScrollArea 
              className="border-4 border-gray-500 p-4"
              style={{ maxHeight: '80vh', width: '80vw', overflow: 'auto' }}
            >
              <Editor
                value={code}
                onValueChange={code => setCode(code)}
                highlight={code => highlight(code, languages.js)}
                padding={10}
                style={{
                  fontFamily: '"Fira code", "Fira Mono", monospace',
                  fontSize: 12,
                }}
              />
               <ScrollBar orientation="horizontal" />
            </ScrollArea>
              <button className="bg-blue-500 text-white p-2 rounded-md" onClick={handleClick}>
                submit code

              </button>
          </div>
        </>
      )}
    </div>
  );
}

