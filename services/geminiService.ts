
import { GoogleGenAI, Type } from "@google/genai";
import { LectureSummary } from "../types";

// 서비스 내에서 공통으로 사용될 AI 인스턴스 생성 로직
const getAIClient = () => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY가 설정되지 않았습니다. 관리자에게 문의하세요.");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const summarizeLecture = async (transcription: string): Promise<LectureSummary> => {
  const ai = getAIClient();
  
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview", 
    contents: `다음은 강의 녹취록입니다. 만약 원문이 외국어라면 반드시 한국어로 번역하여 분석하세요.\n\n녹취록:\n${transcription}`,
    config: {
      systemInstruction: "당신은 세계 최고의 교육 콘텐츠 요약 전문가입니다. 입력된 내용이 어떤 언어든 상관없이 무조건 '한국어'로 번역하고 분석하세요. 결과는 반드시 제공된 JSON 스키마를 엄격히 준수하여 반환해야 합니다.",
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
    if (!text) throw new Error("AI 응답이 비어있습니다.");
    return JSON.parse(text) as LectureSummary;
  } catch (e) {
    console.error("Summary error:", e);
    throw new Error("강의 내용을 요약하는 중 문제가 발생했습니다. 데이터 파싱 실패.");
  }
};

export const transcribeAudioPart = async (base64Audio: string, mimeType: string): Promise<string> => {
  const ai = getAIClient();
  
  // 브라우저의 mimeType이 'audio/webm;codecs=opus' 형태일 경우 단순화합니다.
  const cleanMimeType = mimeType.split(';')[0]; 

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { inlineData: { mimeType: cleanMimeType, data: base64Audio } },
        { text: "이 오디오 파일의 내용을 모두 한국어로 받아쓰기 해주세요. 만약 외국어(영어 등)가 들린다면 반드시 한국어로 번역해서 텍스트로 만들어주세요. 불필요한 노이즈나 추임새는 제외하고 강의 내용만 텍스트로 출력하세요." }
      ]
    }
  });
  
  const result = response.text;
  if (!result || result.trim().length === 0) {
    throw new Error("음성에서 유효한 텍스트를 추출하지 못했습니다. 오디오 크기가 너무 작거나 형식이 지원되지 않을 수 있습니다.");
  }
  
  return result;
};
