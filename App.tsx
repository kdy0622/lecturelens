
import React, { useState, useRef, useEffect } from 'react';
import { RecordingStatus, LectureSummary } from './types';
import { summarizeLecture, transcribeAudioPart } from './services/geminiService';
import SummaryCard from './components/SummaryCard';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Document, Packer, Paragraph, HeadingLevel, AlignmentType } from 'docx';
import fileSaver from 'file-saver';

const saveAs = (fileSaver as any).saveAs || fileSaver;

const KAKAO_JS_KEY = 'YOUR_KAKAO_JS_KEY'; 

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

  useEffect(() => {
    if (window.Kakao && !window.Kakao.isInitialized()) {
      try {
        window.Kakao.init(KAKAO_JS_KEY);
      } catch (e) {
        console.warn("Kakao init skip");
      }
    }
  }, []);

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
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(audioBlob);
      });
      const base64Audio = await base64Promise;
      
      const text = await transcribeAudioPart(base64Audio);
      setTranscription(text);
      
      if (text.trim()) {
        const aiSummary = await summarizeLecture(text);
        setSummary(aiSummary);
      } else {
        alert("인식된 음성 내용이 없습니다. 다시 시도해 주세요.");
        setStatus(RecordingStatus.IDLE);
        return;
      }
      setStatus(RecordingStatus.FINISHED);
    } catch (error: any) {
      console.error("Process error:", error);
      alert("분석 중 오류가 발생했습니다. 마이크 권한이나 인터넷 연결을 확인해 주세요.");
      setStatus(RecordingStatus.IDLE);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const finalBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' });
        processAudio(finalBlob);
      };
      recorder.start();
      setStatus(RecordingStatus.RECORDING);
    } catch (e) {
      alert("마이크 권한이 필요합니다.");
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
      window.scrollTo(0, 0);
      const canvas = await html2canvas(element, { 
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        height: element.scrollHeight,
        windowHeight: element.scrollHeight
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 190;
      const pageHeight = 287;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 10;

      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${summary?.topic || 'lecture'}_요약.pdf`);
    } catch (e) {
      console.error("PDF fail", e);
      alert("PDF 저장 중 오류가 발생했습니다.");
    }
    setIsExporting(null);
  };

  const handleDownloadDocs = async () => {
    if (!summary) return;
    setIsExporting('docs');
    try {
      const doc = new Document({
        sections: [{
          children: [
            new Paragraph({ text: summary.topic, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
            new Paragraph({ text: "주요 요약 포인트", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
            ...summary.mainPoints.flatMap(p => [
              new Paragraph({ text: p.title, heading: HeadingLevel.HEADING_3, spacing: { before: 200 } }),
              ...p.details.map(d => new Paragraph({ text: `- ${d}`, indent: { left: 720 } }))
            ]),
            new Paragraph({ text: "실행 항목", heading: HeadingLevel.HEADING_2, spacing: { before: 400 } }),
            ...summary.actionItems.map(item => new Paragraph({ text: `√ ${item}` }))
          ]
        }]
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${summary.topic || 'lecture'}_요약.docx`);
    } catch (e) {
      console.error("Docs fail", e);
    }
    setIsExporting(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 min-h-screen">
      <header className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-600 text-white mb-4 shadow-lg">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
        </div>
        <h1 className="text-4xl font-extrabold text-slate-900">Lecture Lens</h1>
        <p className="mt-2 text-slate-500 text-lg">AI가 실시간으로 분석하고 요약합니다.</p>
      </header>

      {status === RecordingStatus.IDLE && (
        <div className="bg-white rounded-3xl p-10 shadow-sm border text-center flex flex-col md:flex-row gap-8 justify-center items-center">
          <button onClick={startRecording} className="w-full md:w-64 flex flex-col items-center gap-4 p-8 rounded-2xl bg-indigo-50 hover:bg-indigo-100 transition-all border border-indigo-100">
            <div className="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center text-2xl shadow-lg">🎤</div>
            <div className="font-bold text-slate-800">녹음 시작</div>
          </button>
          <div className="w-full md:w-64 flex flex-col items-center gap-4 p-8 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-all border border-slate-100 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
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
        <div className="bg-white rounded-3xl p-16 shadow-inner border text-center">
          <div className="w-4 h-4 bg-red-500 rounded-full recording-pulse mx-auto mb-6"></div>
          <div className="text-6xl font-mono font-bold text-slate-800 mb-10 tabular-nums">{formatTime(timer)}</div>
          <button onClick={() => { if(window.confirm("녹음을 중단할까요?")) stopRecording(); }} className="bg-slate-900 text-white px-10 py-4 rounded-full font-bold text-lg hover:bg-slate-800 transition shadow-xl mx-auto">
            중단 및 AI 요약
          </button>
        </div>
      )}

      {status === RecordingStatus.PROCESSING && (
        <div className="text-center py-24 bg-white rounded-3xl border">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-2xl font-bold text-indigo-600 animate-pulse">Gemini AI가 분석하고 있습니다</p>
        </div>
      )}

      {status === RecordingStatus.FINISHED && summary && (
        <div className="space-y-8 animate-in fade-in duration-700">
          <div className="flex flex-wrap gap-3 justify-center sticky top-4 z-10 bg-slate-50/90 backdrop-blur-md py-4 rounded-2xl border border-slate-200 px-4">
            <button onClick={handleDownloadPDF} disabled={!!isExporting} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2">
              PDF 저장
            </button>
            <button onClick={handleDownloadDocs} disabled={!!isExporting} className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2">
              Word 저장
            </button>
            <button onClick={() => { setSummary(null); setStatus(RecordingStatus.IDLE); }} className="bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-bold">
              새로 기록
            </button>
          </div>

          <SummaryCard summary={summary} />

          {transcription && (
            <div className="bg-white rounded-2xl p-8 border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-4">받아쓰기 전문</h3>
              <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto pr-4">
                {transcription}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;
