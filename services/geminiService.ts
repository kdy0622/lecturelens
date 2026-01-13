
import { GoogleGenAI, Type } from "@google/genai";
import { LectureSummary } from "../types";

/**
 * We create a new GoogleGenAI instance on every call to ensure it uses
 * the most up-to-date API_KEY from the environment/dialog.
 */

export const summarizeLecture = async (transcription: string): Promise<LectureSummary> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `다음 강의 녹취록을 분석하여 구조화된 JSON 형식으로 요약해줘.
    한국어로 작성하고, 단순 요약을 넘어 강의가 주는 '깊은 통찰(Insights)'을 반드시 포함해줘.
    
    녹취록: ${transcription}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING, description: "강의의 핵심 주제" },
          mainPoints: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                details: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["title", "details"]
            }
          },
          insights: {
            type: Type.ARRAY,
            description: "강의에서 도출할 수 있는 깊은 통찰과 분석",
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING, description: "통찰의 분류 (예: 핵심 교훈, 비즈니스 영향, 향후 전망 등)" },
                content: { type: Type.STRING, description: "상세 통찰 내용" }
              },
              required: ["category", "content"]
            }
          },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          actionItems: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["topic", "mainPoints", "insights", "keywords", "actionItems"],
        propertyOrdering: ["topic", "mainPoints", "insights", "keywords", "actionItems"]
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
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { inlineData: { mimeType: "audio/mp3", data: base64Audio } },
        { text: "오디오 내용을 정확하게 받아쓰기 해줘. 텍스트만 제공해." }
      ]
    }
  });
  return response.text || "";
};
