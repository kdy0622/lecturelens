
import React, { useState, useRef, useEffect } from 'react';
import { RecordingStatus, LectureSummary } from './types';
import { summarizeLecture, transcribeAudioPart } from './services/geminiService';
import SummaryCard from './components/SummaryCard';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import * as docx from 'docx';
import * as FileSaverNamespace from 'file-saver';

const App: React.FC = () => {
  const [status, setStatus] = useState<RecordingStatus>(RecordingStatus.IDLE);
  const [transcription, setTranscription] = useState<string>('');
  const [summary, setSummary] = useState<LectureSummary | null>(null);
  const [timer, setTimer] = useState(0);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [currentMimeType, setCurrentMimeType] = useState<string>('audio/webm');

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
      
      // 전달받은 Blob의 실제 타입을 사용하거나 기본값 사용
      const mimeToUse = audioBlob.type || currentMimeType || "audio/webm";
      const text = await transcribeAudioPart(base64Audio, mimeToUse);
      setTranscription(text);
      
      if (text && text.trim().length > 0) {
        const aiSummary = await summarizeLecture(text);
        setSummary(aiSummary);
        setStatus(RecordingStatus.FINISHED);
      } else {
        alert("음성이 인식되지 않았습니다. 녹음 상태를 확인하거나 조금 더 긴 파일을 업로드해주세요.");
        setStatus(RecordingStatus.IDLE);
      }
    } catch (error: any) {
      console.error("AI Error:", error);
      alert(`분석 중 오류가 발생했습니다: ${error.message || '네트워크 상태를 확인해주세요.'}`);
      setStatus(RecordingStatus.IDLE);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : MediaRecorder.isTypeSupported('audio/ogg') 
          ? 'audio/ogg' 
          : 'audio/mp4';

      setCurrentMimeType(mimeType);
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      
      recorder.onstop = () => {
        const finalBlob = new Blob(audioChunksRef.current, { type: mimeType });
        processAudio(finalBlob);
      };
      
      recorder.start();
      setStatus(RecordingStatus.RECORDING);
    } catch (e) {
      console.error("Mic error:", e);
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
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`${summary?.topic || '강의요약'}.pdf`);
    } catch (e) {
      alert("PDF 저장 실패");
    }
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
            new docx.Paragraph({ text: "핵심 요약", heading: docx.HeadingLevel.HEADING_2, spacing: { before: 400 } }),
            ...summary.mainPoints.flatMap(p => [
              new docx.Paragraph({ text: p.title, heading: docx.HeadingLevel.HEADING_3, spacing: { before: 200 } }),
              ...p.details.map(d => new docx.Paragraph({ text: `- ${d}` }))
            ])
          ]
        }]
      });
      const blob = await docx.Packer.toBlob(doc);
      const saveAs = (FileSaverNamespace as any).saveAs || (FileSaverNamespace as any).default?.saveAs;
      if (saveAs) {
        saveAs(blob, `${summary.topic || '강의요약'}.docx`);
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${summary.topic || '강의요약'}.docx`;
        link.click();
      }
    } catch (e) {
      alert("Word 저장 실패");
    }
    setIsExporting(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <header className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-600 text-white mb-4 shadow-lg">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
        </div>
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Lecture Lens</h1>
        <p className="mt-2 text-slate-500 text-lg font-medium">AI가 실시간 번역하고 요약하는 스마트 강의 노트</p>
      </header>

      <main className="min-h-[400px]">
        {status === RecordingStatus.IDLE && (
          <div className="bg-white rounded-3xl p-10 shadow-sm border border-slate-200 text-center flex flex-col md:flex-row gap-8 justify-center items-center">
            <button onClick={startRecording} className="w-full md:w-64 flex flex-col items-center gap-4 p-8 rounded-2xl bg-indigo-50 hover:bg-indigo-100 transition-all border border-indigo-100 active:scale-95">
              <div className="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center text-2xl shadow-lg">🎤</div>
              <div className="font-bold text-slate-800">녹음 시작</div>
            </button>
            <div className="w-full md:w-64 flex flex-col items-center gap-4 p-8 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-all border border-slate-100 cursor-pointer active:scale-95" onClick={() => fileInputRef.current?.click()}>
              <input type="file" ref={fileInputRef} onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) processAudio(file);
              }} accept="audio/*" className="hidden" />
              <div className="w-16 h-16 bg-slate-600 text-white rounded-full flex items-center justify-center text-2xl shadow-lg">📁</div>
              <div className="font-bold text-slate-800">파일 업로드</div>
            </div>
          </div>
        )}

        {status === RecordingStatus.RECORDING && (
          <div className="bg-white rounded-3xl p-16 shadow-inner border border-slate-200 text-center">
            <div className="w-4 h-4 bg-red-500 rounded-full recording-pulse mx-auto mb-6"></div>
            <div className="text-6xl font-mono font-bold text-slate-800 mb-10 tabular-nums">{formatTime(timer)}</div>
            <button onClick={() => { if(confirm("녹음을 중단하고 한국어로 요약할까요?")) stopRecording(); }} className="bg-slate-900 text-white px-10 py-4 rounded-full font-bold text-lg hover:bg-slate-800 transition shadow-xl active:scale-95">
              중단 및 요약 실행
            </button>
          </div>
        )}

        {status === RecordingStatus.PROCESSING && (
          <div className="text-center py-24 bg-white rounded-3xl border border-slate-200 shadow-sm">
            <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <p className="text-2xl font-bold text-indigo-600 animate-pulse">Gemini AI가 분석 및 번역 중...</p>
            <p className="text-slate-400 mt-2 italic">외국어 강의인 경우 한국어로 변환하여 정리합니다.</p>
          </div>
        )}

        {status === RecordingStatus.FINISHED && summary && (
          <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-wrap gap-3 justify-center sticky top-4 z-20 bg-slate-50/90 backdrop-blur-md py-4 rounded-2xl border border-slate-200 px-4 shadow-sm">
              <button onClick={handleDownloadPDF} disabled={!!isExporting} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition">
                {isExporting === 'pdf' ? '생성 중...' : 'PDF 저장'}
              </button>
              <button onClick={handleDownloadDocs} disabled={!!isExporting} className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-100 transition">
                Word 저장
              </button>
              <button onClick={() => { setSummary(null); setStatus(RecordingStatus.IDLE); }} className="bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-300 transition">
                새 기록
              </button>
            </div>
            <SummaryCard summary={summary} />
            {transcription && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-400 mb-2">추출된 텍스트 (한국어 번역본)</h3>
                <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {transcription}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
