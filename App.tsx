
import React, { useState, useRef, useEffect } from 'react';
import { RecordingStatus, LectureSummary } from './types';
import { summarizeLecture, transcribeAudioPart } from './services/geminiService';
import SummaryCard from './components/SummaryCard';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Document, Packer, Paragraph, HeadingLevel, AlignmentType } from 'docx';
import fileSaver from 'file-saver';

const saveAs = (fileSaver as any).saveAs || fileSaver;

// Kakao SDK Initialization
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
        console.error("Kakao init failed", e);
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
        alert("인식된 음성 내용이 없습니다.");
        setStatus(RecordingStatus.IDLE);
        return;
      }
      setStatus(RecordingStatus.FINISHED);
    } catch (error: any) {
      console.error("Process error:", error);
      alert("분석 중 오류가 발생했습니다: " + (error.message || "알 수 없는 오류"));
      setStatus(RecordingStatus.IDLE);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
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

  const handleStopClick = () => {
    if (window.confirm("녹음을 중단하고 현재까지의 내용을 정리할까요?")) {
      stopRecording();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processAudio(file);
    }
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('summary-content');
    if (!element) return;
    
    setIsExporting('pdf');
    try {
      // 캡처 전 스크롤 위치를 상단으로 이동하여 전체 내용 캡처 보장
      window.scrollTo(0, 0);
      
      // html2canvas가 숨겨진 요소나 잘린 영역까지 캡처하도록 설정
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
      const imgWidth = 210; // A4 가로 (mm)
      const pageHeight = 297; // A4 세로 (mm)
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      // 첫 페이지 추가
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // 내용이 한 페이지를 넘을 경우 페이지 추가
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${summary?.topic || 'lecture'}_요약_리포트.pdf`);
    } catch (e) {
      console.error("PDF download failed", e);
      alert("PDF 생성 중 오류가 발생했습니다.");
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
            new Paragraph({ text: " ", spacing: { after: 200 } }),
            new Paragraph({ text: "핵심 인사이트", heading: HeadingLevel.HEADING_2 }),
            ...summary.insights.map(i => new Paragraph({ text: `• [${i.category}] ${i.content}`, spacing: { after: 100 } })),
            new Paragraph({ text: " ", spacing: { after: 200 } }),
            new Paragraph({ text: "주요 요약 포인트", heading: HeadingLevel.HEADING_2 }),
            ...summary.mainPoints.flatMap(p => [
              new Paragraph({ text: p.title, heading: HeadingLevel.HEADING_3, spacing: { before: 200 } }),
              ...p.details.map(d => new Paragraph({ text: `- ${d}`, indent: { left: 720 } }))
            ]),
            new Paragraph({ text: " ", spacing: { after: 200 } }),
            new Paragraph({ text: "실행 항목 (Action Items)", heading: HeadingLevel.HEADING_2 }),
            ...summary.actionItems.map(item => new Paragraph({ text: `√ ${item}`, spacing: { after: 100 } }))
          ]
        }]
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${summary.topic || 'lecture'}_요약.docx`);
    } catch (e) {
      console.error("Docs download failed", e);
    }
    setIsExporting(null);
  };

  const handleKakaoShare = () => {
    if (!summary || !window.Kakao) return;
    try {
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: summary.topic,
          description: summary.insights[0]?.content || 'AI 강의 요약 리포트',
          imageUrl: 'https://cdn-icons-png.flaticon.com/512/3209/3209265.png',
          link: { mobileWebUrl: window.location.href, webUrl: window.location.href },
        },
        buttons: [{ title: '요약 보기', link: { mobileWebUrl: window.location.href, webUrl: window.location.href } }],
      });
    } catch (e) {
      alert("카카오톡 설정이 필요합니다.");
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <header className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-600 text-white mb-4 shadow-lg">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
        </div>
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Lecture Lens</h1>
        <p className="mt-2 text-slate-500 text-lg font-medium">강의 기록과 핵심 요약을 인공지능으로 간편하게.</p>
      </header>

      {status === RecordingStatus.IDLE && (
        <div className="bg-white rounded-3xl p-10 shadow-sm border text-center flex flex-col md:flex-row gap-8 justify-center items-center">
          <button onClick={startRecording} className="w-full md:w-64 flex flex-col items-center gap-4 p-8 rounded-2xl bg-indigo-50 hover:bg-indigo-100 transition-all border border-indigo-100">
            <div className="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center text-2xl shadow-lg">🎤</div>
            <div>
              <div className="font-bold text-slate-800">실시간 녹음</div>
              <div className="text-xs text-slate-500 mt-1">마이크로 직접 기록</div>
            </div>
          </button>
          <div className="w-full md:w-64 flex flex-col items-center gap-4 p-8 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-all border border-slate-100 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="audio/*" className="hidden" />
            <div className="w-16 h-16 bg-slate-600 text-white rounded-full flex items-center justify-center text-2xl shadow-lg">📁</div>
            <div>
              <div className="font-bold text-slate-800">파일 업로드</div>
              <div className="text-xs text-slate-500 mt-1">MP3, WAV 등 오디오 파일</div>
            </div>
          </div>
        </div>
      )}

      {status === RecordingStatus.RECORDING && (
        <div className="bg-white rounded-3xl p-16 shadow-inner border text-center">
          <div className="w-4 h-4 bg-red-500 rounded-full recording-pulse mx-auto mb-6"></div>
          <div className="text-6xl font-mono font-bold text-slate-800 mb-10 tabular-nums">{formatTime(timer)}</div>
          <div className="flex justify-center gap-4">
            <button onClick={handleStopClick} className="bg-slate-900 text-white px-10 py-4 rounded-full font-bold text-lg hover:scale-105 transition shadow-xl flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd"></path></svg>
              녹음 중단 및 분석
            </button>
          </div>
        </div>
      )}

      {status === RecordingStatus.PROCESSING && (
        <div className="text-center py-24 bg-white rounded-3xl border">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-2xl font-bold text-indigo-600 animate-pulse">Gemini AI가 분석 중입니다</p>
          <p className="text-slate-400 mt-2 font-medium">받아쓰기 및 핵심 요약 내용을 구성하고 있습니다...</p>
        </div>
      )}

      {status === RecordingStatus.FINISHED && summary && (
        <div className="space-y-8 animate-in fade-in duration-700">
          <div className="flex flex-wrap gap-3 justify-center sticky top-4 z-10 bg-slate-50/80 backdrop-blur-md py-4 rounded-2xl shadow-sm px-2 border border-slate-200/50">
            <button 
              onClick={handleDownloadPDF} 
              disabled={!!isExporting} 
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-100 flex items-center gap-2 disabled:opacity-50"
            >
              {isExporting === 'pdf' ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"></path></svg>
              )}
              PDF 리포트 저장
            </button>
            <button 
              onClick={handleDownloadDocs} 
              disabled={!!isExporting} 
              className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-50 transition shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"></path></svg>
              Word 문서
            </button>
            <button onClick={handleKakaoShare} className="bg-[#FEE500] text-[#3c1e1e] px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-[#fdd835] transition shadow-sm">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.707 4.8 4.34 6.111l-.85 3.122c-.113.417.155.833.58.833.154 0 .31-.047.445-.142l3.626-2.426c.28.03.565.047.859.047 4.97 0 9-3.185 9-7.115S16.97 3 12 3z"></path></svg>
              카톡 공유
            </button>
            <button onClick={() => setStatus(RecordingStatus.IDLE)} className="text-slate-400 hover:text-slate-600 px-4 py-2.5 text-sm font-medium transition underline underline-offset-4">새로 기록하기</button>
          </div>

          <SummaryCard summary={summary} />

          {transcription && (
            <div className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                전체 녹취록
              </h3>
              <div className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-slate-200">
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
