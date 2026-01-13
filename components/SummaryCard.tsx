
import React from 'react';
import { LectureSummary } from '../types';

interface SummaryCardProps {
  summary: LectureSummary;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ summary }) => {
  return (
    <div id="summary-content" className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="gradient-bg p-6 text-white">
        <h2 className="text-2xl font-bold">{summary.topic || "강의 요약"}</h2>
        <div className="flex flex-wrap gap-2 mt-4">
          {summary.keywords.map((word, i) => (
            <span key={i} className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-medium">
              #{word}
            </span>
          ))}
        </div>
      </div>
      
      <div className="p-8 space-y-10">
        {/* 인사이트 섹션 - 강조된 영역 */}
        <section className="bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100">
          <h3 className="text-lg font-bold text-indigo-900 mb-4 flex items-center">
            <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center mr-3 shadow-md">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </span>
            강력한 AI 인사이트
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {summary.insights.map((insight, i) => (
              <div key={i} className="bg-white p-4 rounded-xl shadow-sm border border-indigo-50">
                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest block mb-1">{insight.category}</span>
                <p className="text-slate-700 text-sm leading-relaxed">{insight.content}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 핵심 내용 섹션 */}
        <section>
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
            <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mr-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
            </span>
            주요 요약 포인트
          </h3>
          <div className="space-y-6">
            {summary.mainPoints.map((point, i) => (
              <div key={i} className="pl-4 border-l-2 border-slate-200">
                <h4 className="font-bold text-slate-700">{point.title}</h4>
                <ul className="mt-2 space-y-1 text-slate-600 list-disc list-inside text-sm">
                  {point.details.map((detail, j) => (
                    <li key={j}>{detail}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* 실행 항목 섹션 */}
        {summary.actionItems.length > 0 && (
          <section>
            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
              <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mr-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              </span>
              실행 항목 (Action Items)
            </h3>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {summary.actionItems.map((item, i) => (
                <li key={i} className="flex items-start p-3 bg-slate-50 rounded-xl text-sm text-slate-700">
                  <span className="text-emerald-500 mr-2 mt-0.5">●</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className="bg-slate-50 px-8 py-4 text-[10px] text-slate-400 text-right italic">
        Lecture Lens AI - 깊은 분석 모드로 생성되었습니다.
      </div>
    </div>
  );
};

export default SummaryCard;
