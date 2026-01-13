
import React, { useState, useRef, useEffect } from 'react';
import { RecordingStatus, LectureSummary } from './types';
import { summarizeLecture, transcribeAudioPart } from './services/geminiService';
import SummaryCard from './components/SummaryCard';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import * as docx from 'docx';
import * as FileSaverNamespace from 'file-saver';

// 브라우저 전역 객체 확장 제거: 기존 AIStudio 타입과의 충돌 방지
declare global {
  interface Window {
    aistudio: any;
  }
}

const App: React.FC = () => {
  const [status, setStatus] = useState<RecordingStatus>(RecordingStatus.IDLE);
  const [transcription, setTranscription] = useState<string>('');
  const [summary, setSummary] = useState<LectureSummary | null>(null);
  const [timer, setTimer] = useState(0);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [needsApiKey, setNeedsApiKey] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    // @google/genai 가이드라인에 따른 API 키 선택 여부 확인
    if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      setNeedsApiKey(!hasKey && !process.env.API_KEY);
    }
  };

  const handleOpenKeyDialog = async () => {
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      await window.aistudio.openSelectKey();
      // 가이드라인: openSelectKey 호출 후 즉시 성공으로 가정
      setNeedsApiKey(false);
    }
  };

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

  const processAudio = async (audioBlob: Blob) => {
    setStatus(RecordingStatus.PROCESSING);
    setTimer(0);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          if (typeof result === 'string') {
            resolve(result.split(',')[1]);
          } else {
            reject(new Error("파일 읽기 실패"));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });
      const base64Audio = await base64Promise;
      
      const text = await transcribeAudioPart(base64Audio);
      setTranscription(text);
      
      if (text && text.trim().length > 0) {
        const aiSummary = await summarizeLecture(text);
        setSummary(aiSummary);
        setStatus(RecordingStatus.FINISHED);
      } else {
        alert("음성이 감지되지 않았습니다.");
        setStatus(RecordingStatus.IDLE);
      }
    } catch (error: any) {
      console.error("Error:", error);
      // 가이드라인: "Requested entity was not found." 발생 시 키 선택창 다시 열기
      if (error.message?.includes("Requested entity was not found") || error.message === "API_KEY_NOT_FOUND") {
        setNeedsApiKey(true);
        alert("API 키가 유효하지 않거나 설정이 필요합니다.");
        handleOpenKeyDialog();
      } else {
        alert("분석 중 오류가 발생했습니다: " + error.message);
      }
      setStatus(RecordingStatus.IDLE);
    }
  };

  const startRecording = async () => {
    if (needsApiKey) {
      handleOpenKeyDialog();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const finalBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' });
        processAudio(finalBlob);
      };
      recorder.start();
      setStatus(RecordingStatus.RECORDING);
    } catch (e) {
      alert("마이크 사용 권한이 필요합니다.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('summary-content');
    if (!element) return;
    setIsExporting('pdf');
    try {
      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`${summary?.topic || '요약'}.pdf`);
    } catch (e) { alert("PDF 저장 실패"); }
    setIsExporting(null);
  };

  const handleDownloadDocs = async () => {
    if (!summary) return;
    setIsExporting('docs');
    try {
      const doc = new docx.Document({
        sections: [{
          children: [
            new docx.Paragraph({ text: summary.topic, heading: docx.HeadingLevel.HEADING_1, alignment: docx.AlignmentType.CENTER }),
            ...summary.mainPoints.flatMap(p => [
              new docx.Paragraph({ text: p.title, heading: docx.HeadingLevel.HEADING_2 }),
              ...p.details.map(d => new docx.Paragraph({ text: d, bullet: { level: 0 } }))
            ])
          ]
        }]
      });
      const blob = await docx.Packer.toBlob(doc);
      const saveAs = (FileSaverNamespace as any).saveAs || (FileSaverNamespace as any).default?.saveAs;
      if (saveAs) saveAs(blob, `${summary.topic}.docx`);
      else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${summary.topic}.docx`; a.click();
      }
    } catch (e) { alert("Word 저장 실패"); }
    setIsExporting(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {needsApiKey && (
        <div className="mb-8 bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center justify-between animate-bounce">
          <p className="text-amber-800 text-sm font-medium">서비스 이용을 위해 API 키 설정이 필요합니다.</p>
          <button onClick={handleOpenKeyDialog} className="bg-amber-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm">키 설정하기</button>
        </div>
      )}

      <header className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-600 text-white mb-4 shadow-lg">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
        </div>
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Lecture Lens</h1>
        <p className="mt-2 text-slate-500 text-lg font-medium">글로벌 강의도 한국어로 바로 번역하고 요약하세요</p>
      </header>

      <main className="min-h-[400px]">
        {status === RecordingStatus.IDLE && (
          <div className="bg-white rounded-3xl p-10 shadow-sm border border-slate-200 text-center flex flex-col md:flex-row gap-8 justify-center items-center">
            <button onClick={startRecording} className="w-full md:w-64 flex flex-col items-center gap-4 p-8 rounded-2xl bg-indigo-50 hover:bg-indigo-100 transition-all border border-indigo-100 active:scale-95">
              <div className="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center text-2xl shadow-lg">🎤</div>
              <div className="font-bold text-slate-800">녹음 시작</div>
            </button>
            <div className="w-full md:w-64 flex flex-col items-center gap-4 p-8 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-all border border-slate-100 cursor-pointer active:scale-95" onClick={() => fileInputRef.current?.click()}>
              <input type="file" ref={fileInputRef} onChange={(e) => { const f = e.target.files?.[0]; if (f) processAudio(f); }} accept="audio/*" className="hidden" />
              <div className="w-16 h-16 bg-slate-600 text-white rounded-full flex items-center justify-center text-2xl shadow-lg">📁</div>
              <div className="font-bold text-slate-800">파일 업로드</div>
            </div>
          </div>
        )}

        {status === RecordingStatus.RECORDING && (
          <div className="bg-white rounded-3xl p-16 shadow-inner border border-slate-200 text-center">
            <div className="w-4 h-4 bg-red-500 rounded-full recording-pulse mx-auto mb-6"></div>
            <div className="text-6xl font-mono font-bold text-slate-800 mb-10 tabular-nums">{formatTime(timer)}</div>
            <button onClick={() => { if(confirm("분석을 시작할까요?")) stopRecording(); }} className="bg-slate-900 text-white px-10 py-4 rounded-full font-bold text-lg hover:bg-slate-800 transition active:scale-95">분석 시작</button>
          </div>
        )}

        {status === RecordingStatus.PROCESSING && (
          <div className="text-center py-24 bg-white rounded-3xl border border-slate-200 shadow-sm">
            <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <p className="text-2xl font-bold text-indigo-600 animate-pulse">Gemini AI 분석 중...</p>
            <p className="text-slate-400 mt-2">외국어 강의라면 한국어로 변환하여 정리 중입니다.</p>
          </div>
        )}

        {status === RecordingStatus.FINISHED && summary && (
          <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-wrap gap-3 justify-center sticky top-4 z-20 bg-slate-50/90 backdrop-blur-md py-4 rounded-2xl border border-slate-200 px-4 shadow-sm">
              <button onClick={handleDownloadPDF} disabled={!!isExporting} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition active:scale-95">{isExporting === 'pdf' ? '생성 중...' : 'PDF 저장'}</button>
              <button onClick={handleDownloadDocs} disabled={!!isExporting} className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-100 transition active:scale-95">Word 저장</button>
              <button onClick={() => { setSummary(null); setStatus(RecordingStatus.IDLE); }} className="bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-300 transition active:scale-95">다시 하기</button>
            </div>
            <SummaryCard summary={summary} />
          </div>
        )}
      </main>
      <footer className="mt-20 text-center text-slate-400 text-xs">
        <p>© 2024 Lecture Lens. Gemini 3 Pro AI Powered.</p>
        <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline mt-1 block">API 키 및 결제 안내</a>
      </footer>
    </div>
  );
};

export default App;
