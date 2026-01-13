
import { GoogleGenAI, Type } from "@google/genai";
import { LectureSummary } from "../types";

export const summarizeLecture = async (transcription: string): Promise<LectureSummary> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview", // 복잡한 추론을 위해 Pro 모델 사용
    contents: `다음은 강의 녹취록입니다. 
    1. 원문이 외국어라면 반드시 한국어로 번역하세요.
    2. 분석 내용을 구조화된 JSON 형식으로 요약하세요.
    3. 단순 요약을 넘어 강의가 주는 '깊은 통찰(Insights)'을 포함하세요.
    
    녹취록: ${transcription}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING, description: "강의의 핵심 주제 (한국어)" },
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
    const text = response.text;
    return JSON.parse(text || '{}') as LectureSummary;
  } catch (e) {
    throw new Error("AI 응답 파싱 실패");
  }
};

export const transcribeAudioPart = async (base64Audio: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 오디오 처리에 최적화된 최신 Flash 모델 사용
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { inlineData: { mimeType: "audio/mp3", data: base64Audio } },
        { text: "이 오디오의 내용을 받아쓰기 해주세요. 만약 오디오가 외국어라면 반드시 한국어로 번역해서 텍스트를 제공하세요. 텍스트 결과만 출력하세요." }
      ]
    }
  });
  return response.text || "";
};
