export interface Resume {
  id: string;
  fileName: string;
  fileData: string; // base64 encoded PDF content
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  summary?: string;
  skills?: string[];
  experience?: WorkExperience[];
  education?: Education[];
  uploadedAt: number;
}

export interface AISettings {
  apiKey: string;
  endpoint: string;
  model: string;
  enabled: boolean;
}

export interface DownloadSettings {
  useSelectedFolder: boolean;
  selectedFolderName: string;
}

export interface WorkExperience {
  company: string;
  position: string;
  duration: string;
  description: string;
}

export interface Education {
  institution: string;
  degree: string;
  field: string;
  year: string;
}

export interface JobListing {
  title: string;
  company: string;
  description: string;
  requirements?: string[];
  companyOverview?: string;
}

export interface CoverLetterRequest {
  resumeId: string;
  jobListing: JobListing;
}

export interface CoverLetterResponse {
  content: string;
  generatedAt: number;
}
