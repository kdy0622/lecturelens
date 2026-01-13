
import React, { useState, useRef, useEffect } from 'react';
import { RecordingStatus, LectureSummary } from './types';
import { summarizeLecture, transcribeAudioPart } from './services/geminiService';
import SummaryCard from './components/SummaryCard';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import fileSaver from 'file-saver';

// Handle potential differences in how saveAs is exported via ESM
const saveAs = (fileSaver as any).saveAs || fileSaver;

const App: React.FC = () => {
  const [status, setStatus] = useState<RecordingStatus>(RecordingStatus.IDLE);
  const [transcription, setTranscription] = useState<string>('');
  const [summary, setSummary] = useState<LectureSummary | null>(null);
  const [timer, setTimer] = useState(0);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let t: number;
    if (status === RecordingStatus.RECORDING) {
      t = window.setInterval(() => setTimer(prev => prev + 1), 1000);
    }
    return () => clearInterval(t);
  }, [status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.readAsDataURL(blob);
    });
  };

  const processAudio = async (audioBlob: Blob) => {
    setStatus(RecordingStatus.PROCESSING);
    try {
      const base64Audio = await blobToBase64(audioBlob);
      const text = await transcribeAudioPart(base64Audio);
      setTranscription(text);
      
      if (text.trim()) {
        const aiSummary = await summarizeLecture(text);
        setSummary(aiSummary);
      }
      setStatus(RecordingStatus.FINISHED);
    } catch (error) {
      console.error("오디오 처리 실패:", error);
      alert("요약 도중 오류가 발생했습니다. 파일 형식을 확인하거나 다시 시도해주세요.");
      setStatus(RecordingStatus.IDLE);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processAudio(file);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' });
        processAudio(audioBlob);
      };

      recorder.start();
      setStatus(RecordingStatus.RECORDING);
    } catch (err) {
      console.error("마이크 접근 거부:", err);
      alert("강의 녹음을 위해 마이크 접근 권한을 허용해주세요.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && status === RecordingStatus.RECORDING) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('summary-content');
    if (!element) return;
    setIsExporting('pdf');
    try {
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${summary?.topic || 'lecture'}_요약.pdf`);
    } finally {
      setIsExporting(null);
    }
  };

  const handleDownloadDocs = async () => {
    if (!summary) return;
    setIsExporting('docs');
    try {
      const sections = [];
      
      // 제목
      sections.push(new Paragraph({ text: summary.topic, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }));
      sections.push(new Paragraph({ text: `생성일: ${new Date().toLocaleDateString()}`, alignment: AlignmentType.RIGHT }));
      
      // 인사이트
      sections.push(new Paragraph({ text: "강력한 AI 인사이트", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }));
      summary.insights.forEach(ins => {
        sections.push(new Paragraph({ children: [new TextRun({ text: `[${ins.category}] `, bold: true }), new TextRun(ins.content)] }));
      });

      // 주요 내용
      sections.push(new Paragraph({ text: "핵심 요약 포인트", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }));
      summary.mainPoints.forEach(pt => {
        sections.push(new Paragraph({ text: pt.title, heading: HeadingLevel.HEADING_3 }));
        pt.details.forEach(det => sections.push(new Paragraph({ text: `• ${det}`, indent: { left: 720 } })));
      });

      // 실행 항목
      sections.push(new Paragraph({ text: "실행 항목 (Action Items)", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }));
      summary.actionItems.forEach(item => sections.push(new Paragraph({ text: `□ ${item}` })));

      const doc = new Document({ sections: [{ children: sections }] });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${summary.topic || 'lecture'}_요약.docx`);
    } catch (err) {
      console.error("DOCX 저장 실패:", err);
      alert("문서 생성 중 오류가 발생했습니다.");
    } finally {
      setIsExporting(null);
    }
  };

  const reset = () => {
    setStatus(RecordingStatus.IDLE);
    setSummary(null);
    setTranscription('');
    setTimer(0);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <header className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-600 text-white mb-4 shadow-lg">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
        </div>
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Lecture Lens</h1>
        <p className="mt-2 text-slate-500 text-lg font-medium">실시간 녹음 또는 파일 업로드로 완벽한 요약을 얻으세요.</p>
      </header>

      <main className="space-y-8">
        <div className="bg-white rounded-3xl p-10 shadow-sm border border-slate-100 flex flex-col items-center justify-center text-center">
          {status === RecordingStatus.IDLE && (
            <div className="w-full space-y-8">
              <div className="text-slate-500 text-lg">기록 방식을 선택하세요</div>
              <div className="flex flex-col md:flex-row items-center justify-center gap-12">
                {/* 실시간 녹음 */}
                <div className="flex flex-col items-center space-y-4">
                  <button onClick={startRecording} className="group relative flex items-center justify-center w-24 h-24 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full transition-all shadow-xl hover:scale-105 active:scale-95">
                    <div className="absolute inset-0 rounded-full group-hover:animate-ping bg-indigo-400/30"></div>
                    <svg className="w-10 h-10 relative z-10" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                  </button>
                  <span className="font-bold text-slate-700">실시간 녹음</span>
                </div>
                {/* 파일 업로드 */}
                <div className="flex flex-col items-center space-y-4">
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="audio/*" className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center w-24 h-24 bg-white border-2 border-dashed border-indigo-200 text-indigo-600 rounded-full transition-all shadow-sm hover:border-indigo-400 hover:bg-indigo-50 hover:scale-105 active:scale-95">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4-4m4 4H12"></path></svg>
                  </button>
                  <span className="font-bold text-slate-700">오디오 파일 업로드</span>
                </div>
              </div>
            </div>
          )}

          {status === RecordingStatus.RECORDING && (
            <div className="space-y-6">
              <div className="flex flex-col items-center">
                <div className="w-4 h-4 bg-red-500 rounded-full recording-pulse mb-4"></div>
                <div className="text-5xl font-mono font-bold text-slate-800 tabular-nums">{formatTime(timer)}</div>
              </div>
              <button onClick={stopRecording} className="px-8 py-4 bg-slate-900 text-white rounded-full font-bold hover:bg-slate-800 transition shadow-lg flex items-center gap-2 text-lg">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd"></path></svg>
                분석 시작하기
              </button>
            </div>
          )}

          {status === RecordingStatus.PROCESSING && (
            <div className="py-12 flex flex-col items-center space-y-4">
              <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xl font-bold text-indigo-600 animate-pulse">Gemini가 분석 중입니다...</p>
              <p className="text-slate-400">오디오 전사 및 인사이트 추출 중입니다.</p>
            </div>
          )}

          {status === RecordingStatus.FINISHED && (
            <div className="w-full">
              <div className="flex flex-wrap justify-between items-center mb-8 gap-4">
                <div className="flex gap-3">
                  <button onClick={handleDownloadPDF} disabled={!!isExporting} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold transition disabled:opacity-50 hover:bg-indigo-700 shadow-md">
                    {isExporting === 'pdf' ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>}
                    PDF 저장
                  </button>
                  <button onClick={handleDownloadDocs} disabled={!!isExporting} className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl font-bold transition disabled:opacity-50 hover:bg-slate-50 shadow-sm">
                    {isExporting === 'docs' ? <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>}
                    Word(.docx) 저장
                  </button>
                </div>
                <button onClick={reset} className="text-slate-400 hover:text-slate-600 font-medium transition flex items-center gap-1 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                  처음으로
                </button>
              </div>
              {summary && <SummaryCard summary={summary} />}
              {transcription && (
                <details className="mt-8 text-left bg-slate-50 rounded-2xl p-6 cursor-pointer group border border-slate-100">
                  <summary className="font-bold text-slate-600 select-none flex items-center justify-between">
                    전체 전사 데이터 (Full Script)
                    <svg className="w-5 h-5 group-open:rotate-180 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </summary>
                  <div className="mt-4 text-slate-600 text-sm leading-relaxed whitespace-pre-wrap font-medium">{transcription}</div>
                </details>
              )}
            </div>
          )}
        </div>
      </main>
      <footer className="mt-16 pt-8 border-t border-slate-200 text-center text-slate-400 text-sm">
        &copy; {new Date().getFullYear()} Lecture Lens. Gemini 3 Pro AI를 통한 고성능 분석 솔루션.
      </footer>
    </div>
  );
};

export default App;
