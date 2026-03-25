import { Document, Packer, Paragraph, TextRun } from 'docx';

import { AISettings, Resume, JobListing } from '../types/index';

const RESUME_NAME_STOP_WORDS = new Set([
  'resume',
  'cv',
  'cover',
  'letter',
  'final',
  'updated',
  'developer',
  'engineer',
  'software',
  'fullstack',
  'full',
  'stack',
  'frontend',
  'backend'
]);

interface ResumeIdentity {
  fullName: string;
  lastName: string;
}

interface GeneratedCoverLetter {
  content: string;
  usedAI: boolean;
}

function resolveCompanyReferences(company: string): {
  companyName: string;
  companyPossessive: string;
  teamReference: string;
} {
  const normalizedCompany = company.trim();

  if (!normalizedCompany || normalizedCompany === 'Company') {
    return {
      companyName: 'your organization',
      companyPossessive: 'your organization\'s',
      teamReference: 'your team'
    };
  }

  const possessive = normalizedCompany.endsWith('s')
    ? `${normalizedCompany}'`
    : `${normalizedCompany}'s`;

  return {
    companyName: normalizedCompany,
    companyPossessive: possessive,
    teamReference: `${normalizedCompany}'s team`
  };
}

function getDefaultAISettings(): AISettings {
  return {
    apiKey: '',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4.1-mini',
    enabled: false
  };
}

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function inferResumeIdentity(resume: Resume): ResumeIdentity {
  const source = [resume.name, resume.fileName.replace(/\.[^.]+$/, '')]
    .filter(Boolean)
    .join(' ');

  const nameParts = source
    .split(/[^a-zA-Z]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
    .filter((part) => !RESUME_NAME_STOP_WORDS.has(part.toLowerCase()));

  if (nameParts.length === 0) {
    return {
      fullName: 'Your Name',
      lastName: 'Applicant'
    };
  }

  if (nameParts.length === 1) {
    const singleName = toTitleCase(nameParts[0]);
    return {
      fullName: singleName,
      lastName: singleName
    };
  }

  const firstName = toTitleCase(nameParts[0]);
  const lastName = toTitleCase(nameParts[1]);

  return {
    fullName: `${firstName} ${lastName}`,
    lastName
  };
}

class CoverLetterGenerator {
  /**
   * Generate a cover letter using the resume and job listing
   * Currently a placeholder - integrate with OpenAI API or similar
   */
  async generateCoverLetter(
    resume: Resume,
    jobListing: JobListing,
    aiSettings: AISettings
  ): Promise<GeneratedCoverLetter> {
    const identity = inferResumeIdentity(resume);
    console.log('Background: aiSettings.enabled =', aiSettings.enabled, '| hasApiKey =', !!aiSettings.apiKey, '| endpoint =', aiSettings.endpoint);
    if (aiSettings.enabled && aiSettings.apiKey) {
      console.log('Background: Calling AI generation...');
      try {
        const result = await this.generateWithAI(identity, resume, jobListing, aiSettings);
        console.log('Background: AI generation succeeded');
        return {
          content: this.normalizeCoverLetterContent(result, identity.fullName),
          usedAI: true
        };
      } catch (error) {
        console.error('Background: AI generation failed, falling back to template:', error);
      }
    } else {
      console.log('Background: AI disabled or no API key — using template');
    }

    const coverLetter = this.createTemplateCoverLetter(
      identity.fullName,
      jobListing
    );

    return {
      content: this.normalizeCoverLetterContent(coverLetter, identity.fullName),
      usedAI: false
    };
  }

  private async generateWithAI(
    identity: ResumeIdentity,
    resume: Resume,
    job: JobListing,
    aiSettings: AISettings
  ): Promise<string> {
    const response = await fetch(aiSettings.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiSettings.apiKey}`
      },
      body: JSON.stringify({
        model: aiSettings.model,
        temperature: 0.6,
        messages: [
          {
            role: 'system',
            content: 'You write concise, professional cover letters. Return plain text only. Use standard business letter formatting with a date line, greeting, 4 to 5 short body paragraphs, and a closing with the candidate name. Do not use placeholders.'
          },
          {
            role: 'user',
            content: [
              `Candidate name: ${identity.fullName}`,
              `Resume filename: ${resume.fileName}`,
              `Job title: ${job.title}`,
              `Company: ${job.company}`,
              `Job description: ${job.description}`,
              `Requirements: ${(job.requirements || []).join('; ') || 'None provided'}`,
              'Write a tailored cover letter based only on the information above. If exact candidate experience is unavailable, keep claims general and truthful.'
            ].join('\n\n')
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`AI request failed with status ${response.status}`);
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('AI response did not contain any content');
    }

    return content;
  }

  private createTemplateCoverLetter(name: string, job: JobListing): string {
    const today = new Date().toLocaleDateString();
    const companyReferences = resolveCompanyReferences(job.company);

    return `${today}

Dear Hiring Manager,

I am writing to express my strong interest in the ${job.title} position at ${companyReferences.companyName}. With my background and experience, I am confident I would be a valuable addition to ${companyReferences.teamReference}.

Throughout my career, I have developed strong skills and experience that align well with the requirements of this position. I am particularly drawn to this opportunity because of ${companyReferences.companyPossessive} focus on building strong products and delivering meaningful results.

My experience aligns well with the core areas emphasized in the job description, including collaboration, problem solving, and delivering reliable software. I would welcome the opportunity to bring that mindset and discipline to this role.

I am a dedicated professional who thrives in collaborative environments and is committed to delivering high-quality results. I am confident that my background, skills, and enthusiasm make me an excellent fit for this role.

I would welcome the opportunity to discuss how I can contribute to ${companyReferences.companyPossessive} continued success. Thank you for considering my application.

Sincerely,

${name}`;
  }

  private normalizeCoverLetterContent(content: string, fullName: string): string {
    const withoutCodeFences = content.replace(/```[\s\S]*?```/g, '').trim();
    const withoutBracketPlaceholders = withoutCodeFences
      .replace(/\[[^\]]*name[^\]]*\]/gi, fullName)
      .replace(/\[[^\]]*(address|city|state|zip|email|phone|date)[^\]]*\]/gi, '')
      .trim();

    const cleanedLines = withoutBracketPlaceholders
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.replace(/^\s{0,3}[-*]\s+/, '').trim())
      .filter((line, index, allLines) => {
        if (line.length > 0) return true;
        const prev = allLines[index - 1];
        return prev !== '';
      })
      .filter((line) => !/^(cover letter|subject:)\s*$/i.test(line))
      .filter((line) => !/^hiring manager\b.*(company address|city|state|zip)/i.test(line))
      .filter((line) => !/^\s*\[.*\]\s*$/i.test(line));

    let normalized = cleanedLines.join('\n');

    normalized = normalized
      .replace(/^\s*Date:\s*/im, '')
      .replace(new RegExp(`\\b${fullName.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}\\b`, 'gi'), '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    normalized = normalized
      .replace(/\n\s*(warm regards|best regards|kind regards|regards|thanks|sincerely),?[\s\S]*$/i, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!/Dear\s+Hiring Manager,/i.test(normalized)) {
      normalized = `Dear Hiring Manager,\n\n${normalized}`;
    }

    normalized = `${normalized}\n\nSincerely,\n\n${fullName}`;

    return normalized;
  }
}

class WordDocumentExporter {
  /**
   * Export cover letter to Word document
   * Uses the docx library
   */
  async exportToWord(coverLetterContent: string): Promise<string> {
    const paragraphs = coverLetterContent
      .split(/\n\n+/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map(
        (block, index, blocks) =>
          new Paragraph({
            children: [new TextRun(block)],
            spacing: {
              after: index === blocks.length - 1 ? 0 : 200,
              line: 276
            }
          })
      );

    const document = new Document({
      sections: [
        {
          children: paragraphs
        }
      ]
    });

    return Packer.toBase64String(document);
  }
}

function sanitizeFileNameSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, '')
    .trim() || 'Company';
}

// Use a persistent port connection so the service worker stays alive during long AI fetches
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'coverLetter') return;

  port.onMessage.addListener((request) => {
    if (request.action === 'generateCoverLetterDraft') {
      console.log('Background: Received generateCoverLetterDraft request for job:', request.jobListing);
      handleGenerateCoverLetterDraft(request.jobListing, (response) => {
        try {
          port.postMessage(response);
        } catch (e) {
          console.error('Background: Could not post message to port:', e);
        }
      });
    }

    if (request.action === 'downloadCoverLetter') {
      console.log('Background: Received downloadCoverLetter request for job:', request.jobListing);
      handleDownloadCoverLetter(request.coverLetterContent, request.jobListing, (response) => {
        try {
          port.postMessage(response);
        } catch (e) {
          console.error('Background: Could not post message to port:', e);
        }
      });
    }

    if (request.action === 'exportCoverLetterFile') {
      console.log('Background: Received exportCoverLetterFile request for job:', request.jobListing);
      handleExportCoverLetterFile(request.coverLetterContent, request.jobListing, (response) => {
        try {
          port.postMessage(response);
        } catch (e) {
          console.error('Background: Could not post message to port:', e);
        }
      });
    }
  });
});

async function handleGenerateCoverLetter(
  jobListing: JobListing,
  sendResponse: (response: any) => void
): Promise<void> {
  await handleGenerateCoverLetterDraft(jobListing, sendResponse);
}

async function handleGenerateCoverLetterDraft(
  jobListing: JobListing,
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    console.log('Background: Starting cover letter generation...');
    
    // Get resume from storage using Promise wrapper
    const result = await new Promise<{ resume?: Resume; aiSettings?: AISettings }>((resolve) => {
      chrome.storage.local.get(['resume', 'aiSettings'], (res) => {
        console.log('Background: Retrieved from storage:', Object.keys(res));
        resolve(res);
      });
    });

    if (!result.resume) {
      console.error('Background: No resume found in storage');
      sendResponse({ success: false, error: 'No resume found - please upload resume first' });
      return;
    }

    console.log('Background: Found resume:', result.resume.fileName);
    const resume = result.resume as Resume;
    const identity = inferResumeIdentity(resume);
    const aiSettings = result.aiSettings || getDefaultAISettings();
    const generator = new CoverLetterGenerator();

    // Generate cover letter
    console.log('Background: Generating cover letter...');
    const generation = await generator.generateCoverLetter(resume, jobListing, aiSettings);
    console.log('Background: Cover letter generated, length:', generation.content.length);

    const filename = `${sanitizeFileNameSegment(identity.lastName)} - ${sanitizeFileNameSegment(jobListing.company)} Cover Letter.docx`;
    sendResponse({
      success: true,
      coverLetterContent: generation.content,
      filename,
      usedAI: generation.usedAI,
      message: generation.usedAI ? 'Draft generated with AI' : 'Draft generated with template'
    });
  } catch (error) {
    console.error('Background: Error generating cover letter:', error);
    sendResponse({ success: false, error: String(error) });
  }
}

async function handleDownloadCoverLetter(
  coverLetterContent: string,
  jobListing: JobListing,
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    const result = await new Promise<{ resume?: Resume }>((resolve) => {
      chrome.storage.local.get(['resume'], (res) => resolve(res));
    });

    if (!result.resume) {
      sendResponse({ success: false, error: 'No resume found - please upload resume first' });
      return;
    }

    const identity = inferResumeIdentity(result.resume);
    const exporter = new WordDocumentExporter();

    console.log('Background: Exporting reviewed draft to Word...');
    const base64Document = await exporter.exportToWord(coverLetterContent);
    console.log('Background: Word document created, base64 length:', base64Document.length);

    const url = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${base64Document}`;
    const filename = `${sanitizeFileNameSegment(identity.lastName)} - ${sanitizeFileNameSegment(jobListing.company)} Cover Letter.docx`;

    console.log('Background: Triggering download with filename:', filename);

    chrome.downloads.download(
      {
        url,
        filename,
        saveAs: false
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Background: Download error:', chrome.runtime.lastError);
          sendResponse({ success: false, error: 'Failed to download: ' + chrome.runtime.lastError.message });
          return;
        }

        console.log('Background: Download started with ID:', downloadId);
        sendResponse({ success: true, message: 'Cover letter download started' });
      }
    );
  } catch (error) {
    console.error('Background: Error downloading cover letter:', error);
    sendResponse({ success: false, error: String(error) });
  }
}

async function handleExportCoverLetterFile(
  coverLetterContent: string,
  jobListing: JobListing,
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    const result = await new Promise<{ resume?: Resume }>((resolve) => {
      chrome.storage.local.get(['resume'], (res) => resolve(res));
    });

    if (!result.resume) {
      sendResponse({ success: false, error: 'No resume found - please upload resume first' });
      return;
    }

    const identity = inferResumeIdentity(result.resume);
    const exporter = new WordDocumentExporter();
    const base64Document = await exporter.exportToWord(coverLetterContent);
    const filename = `${sanitizeFileNameSegment(identity.lastName)} - ${sanitizeFileNameSegment(jobListing.company)} Cover Letter.docx`;

    console.log('Background: Exported cover letter file payload for:', filename, '| base64 length:', base64Document.length);

    sendResponse({
      success: true,
      filename,
      base64Document
    });
  } catch (error) {
    console.error('Background: Error exporting cover letter:', error);
    sendResponse({ success: false, error: String(error) });
  }
}
