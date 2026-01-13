
import { GoogleGenAI, Type } from "@google/genai";
import { LectureSummary } from "../types";

/**
 * 가이드라인에 따라 API 호출 직전에 새로운 인스턴스를 생성합니다.
 */
const getAiClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
};

export const summarizeLecture = async (transcription: string): Promise<LectureSummary> => {
  // 호출 직전에 클라이언트 생성
  const ai = getAiClient();
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `다음은 강의 녹취록입니다. 이를 분석하여 구조화된 JSON 형식으로 요약해주세요.
      한국어로 작성하고, 특히 'insights' 섹션에는 강의 내용에서 추론할 수 있는 비즈니스적 가치나 깊은 교훈을 포함하세요.
      
      녹취록: ${transcription}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING },
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

    // 가이드라인: .text()가 아닌 .text 프로퍼티 사용
    return JSON.parse(response.text || '{}') as LectureSummary;
  } catch (error: any) {
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("API_KEY_NOT_FOUND");
    }
    throw error;
  }
};

export const transcribeAudioPart = async (base64Audio: string): Promise<string> => {
  // 호출 직전에 클라이언트 생성
  const ai = getAiClient();
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { mimeType: "audio/mp3", data: base64Audio } },
          { text: "이 오디오 파일의 내용을 한국어 텍스트로 변환해줘." }
        ]
      }
    });
    // 가이드라인: .text 프로퍼티 사용
    return response.text || "";
  } catch (error: any) {
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("API_KEY_NOT_FOUND");
    }
    throw error;
  }
};
