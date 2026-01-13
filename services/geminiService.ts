
import { GoogleGenAI, Type } from "@google/genai";
import { LectureSummary } from "../types";

export const summarizeLecture = async (transcription: string): Promise<LectureSummary> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    // 복잡한 추론과 한국어 요약을 위해 최신 Pro 모델 사용
    model: "gemini-3-pro-preview", 
    contents: `다음은 강의 녹취록입니다. 
    1. 만약 녹취록 내용이 한국어가 아닌 다른 언어(영어, 일본어 등)라면 반드시 한국어로 번역하여 분석하세요.
    2. 분석 내용을 구조화된 JSON 형식으로 요약하세요.
    3. 강의의 주제, 주요 포인트, 실행 항목, 그리고 깊은 인사이트를 포함해야 합니다.
    
    녹취록: ${transcription}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING, description: "강의의 핵심 주제 (반드시 한국어)" },
          mainPoints: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "소주제 제목" },
                details: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["title", "details"]
            }
          },
          insights: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
                content: { type: Type.STRING }
              },
              required: ["category", "content"]
            }
          },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          actionItems: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["topic", "mainPoints", "insights", "keywords", "actionItems"]
      }
    }
  });

  try {
    return JSON.parse(response.text || '{}') as LectureSummary;
  } catch (e) {
    console.error("JSON Parsing error:", response.text);
    throw new Error("AI 요약 데이터를 처리하는 중 오류가 발생했습니다.");
  }
};

export const transcribeAudioPart = async (base64Audio: string, mimeType: string = "audio/mp3"): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 멀티모달 처리에 최적화된 최신 Flash 모델 사용
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { inlineData: { mimeType: mimeType, data: base64Audio } },
        { text: "이 오디오의 내용을 받아쓰기 해주세요. 만약 오디오가 한국어가 아니라면(예: 영어), 반드시 한국어로 번역해서 텍스트를 생성하세요. 텍스트 결과만 출력하세요." }
      ]
    }
  });
  
  if (!response.text) {
    throw new Error("음성에서 텍스트를 추출하지 못했습니다.");
  }
  
  return response.text;
};
