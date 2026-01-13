
export interface SummaryPoint {
  title: string;
  details: string[];
}

export interface LectureInsight {
  category: string;
  content: string;
}

export interface LectureSummary {
  topic: string;
  mainPoints: SummaryPoint[];
  keywords: string[];
  actionItems: string[];
  insights: LectureInsight[]; // 추가: 강의의 깊은 통찰
}

export enum RecordingStatus {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  PROCESSING = 'PROCESSING',
  FINISHED = 'FINISHED'
}

export interface TranscriptionChunk {
  timestamp: string;
  text: string;
}
