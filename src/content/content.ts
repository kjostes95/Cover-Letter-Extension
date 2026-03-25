import { JobListing } from '../types/index';

class JobListingExtractor {
  /**
   * Extract job listing information from the current page
   * Supports LinkedIn, Rippling, Indeed, Glassdoor, and other ATS platforms
   */
  extractJobListing(): JobListing | null {
    console.log('Starting job extraction...');
    const title = this.extractJobTitle();
    const description = this.extractDescription();
    const jobListing: JobListing = {
      title,
      company: this.extractCompanyName(description, title),
      description,
      requirements: this.extractRequirements()
    };

    console.log('Extracted job listing:', jobListing);

    // Be more lenient - require at least title and description
    if (!jobListing.title || !jobListing.description) {
      console.log('Missing required fields - title or description');
      return null;
    }

    // Use fallback company name if not found
    if (!jobListing.company) {
      jobListing.company = 'Company';
    }

    return jobListing;
  }

  private extractJobTitle(): string {
    // LinkedIn
    const linkedInTitle = document.querySelector('h1.jobs-details-top-card__job-title');
    if (linkedInTitle?.textContent) {
      console.log('Found LinkedIn job title');
      return linkedInTitle.textContent.trim();
    }

    // Rippling ATS / Generic data-qa selectors
    const ripplingTitle = document.querySelector('h1[data-qa*="title"], [data-qa*="job-title"], h1[class*="job-title"]');
    if (ripplingTitle?.textContent) {
      console.log('Found Rippling/ATS job title');
      return ripplingTitle.textContent.trim();
    }

    // Indeed
    const indeedTitle = document.querySelector('h1[class*="jobsearch"]');
    if (indeedTitle?.textContent) {
      console.log('Found Indeed job title');
      return indeedTitle.textContent.trim();
    }

    // Generic h1 tags (try to find the most likely one)
    const h1s = document.querySelectorAll('h1');
    for (let i = 0; i < h1s.length; i++) {
      const h1 = h1s[i];
      const text = h1.textContent?.trim();
      if (text && text.length > 5 && text.length < 200 && !text.toLowerCase().includes('you')) {
        console.log('Found generic H1 title:', text);
        return text;
      }
    }

    // Fallback to page title
    const pageTitle = document.title.split('|')[0].split('-')[0].trim();
    console.log('Using page title as fallback:', pageTitle);
    return pageTitle || 'Job Position';
  }

  private extractCompanyName(description: string, jobTitle: string): string {
    // LinkedIn
    const linkedInCompany = document.querySelector('a.jobs-details-top-card__company-name, [data-qa*="company-name"]');
    if (linkedInCompany?.textContent) {
      const text = linkedInCompany.textContent.trim();
      if (text.length > 0) {
        console.log('Found LinkedIn company');
        return text;
      }
    }

    // Rippling ATS - look for company branding
    const ripplingCompany = document.querySelector('[data-qa*="company"], [class*="company-name"], .org-name');
    if (ripplingCompany?.textContent) {
      const text = ripplingCompany.textContent.trim();
      if (text.length > 0 && text.length < 200) {
        console.log('Found Rippling company');
        return text;
      }
    }

    const metaSiteName = document.querySelector('meta[property="og:site_name"], meta[name="application-name"]');
    const metaSiteNameContent = metaSiteName?.getAttribute('content')?.trim();
    if (metaSiteNameContent && metaSiteNameContent.toLowerCase() !== 'rippling recruiting') {
      console.log('Found company from meta site name');
      return metaSiteNameContent;
    }

    const companyFromDescription = this.extractCompanyNameFromDescription(description, jobTitle);
    if (companyFromDescription) {
      console.log('Found company from description text');
      return companyFromDescription;
    }

    const companyFromUrl = this.extractCompanyNameFromUrl();
    if (companyFromUrl) {
      console.log('Found company from URL');
      return companyFromUrl;
    }

    // Indeed
    const indeedCompany = document.querySelector('[data-company-name], a[href*="companies"]');
    if (indeedCompany?.textContent) {
      const text = indeedCompany.textContent.trim();
      if (text.length > 0) {
        console.log('Found Indeed company');
        return text;
      }
    }

    // Generic patterns
    const allElements = document.querySelectorAll('[class*="company"], [class*="employer"], [data-company]');
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      const text = el.textContent?.trim() || '';
      if (text.length > 2 && text.length < 100) {
        console.log('Found generic company element');
        return text;
      }
    }

    console.log('No company found, using fallback');
    return '';
  }

  private extractCompanyNameFromDescription(description: string, jobTitle: string): string {
    const patterns = [
      /welcome to\s+([A-Z][A-Za-z0-9&' .-]{1,60})[!,.]/i,
      /position at\s+([A-Z][A-Za-z0-9&' .-]{1,60})[,.]/i,
      /join\s+([A-Z][A-Za-z0-9&' .-]{1,60})[,.]/i,
      /([A-Z][A-Za-z0-9&' .-]{1,60})\s+is built on/i,
      /([A-Z][A-Za-z0-9&' .-]{1,60})\s+developers/i
    ];

    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match?.[1]) {
        const candidate = match[1].trim();
        if (candidate && candidate !== jobTitle && candidate.length < 80) {
          return candidate;
        }
      }
    }

    return '';
  }

  private extractCompanyNameFromUrl(): string {
    try {
      const url = new URL(window.location.href);
      if (url.hostname === 'ats.rippling.com') {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length > 0) {
          const companySlug = segments[0];
          if (companySlug && companySlug !== 'jobs') {
            return companySlug.charAt(0).toUpperCase() + companySlug.slice(1);
          }
        }
      }
    } catch (error) {
      console.error('Error extracting company from URL:', error);
    }

    return '';
  }

  private extractDescription(): string {
    // LinkedIn - look for about role section
    const linkedInAbout = document.querySelector('[data-qa="job-details-about-role"]');
    if (linkedInAbout?.textContent) {
      const text = linkedInAbout.textContent.trim();
      if (text.length > 100) {
        console.log('Found LinkedIn job description');
        return text.substring(0, 3000);
      }
    }

    // Rippling ATS - common description containers
    const ripplingDesc = document.querySelector('[data-qa*="description"], [class*="job-description"], [class*="job-details"]');
    if (ripplingDesc?.textContent) {
      const text = ripplingDesc.textContent.trim();
      if (text.length > 100) {
        console.log('Found Rippling job description');
        return text.substring(0, 3000);
      }
    }

    // Indeed
    const indeedDesc = document.querySelector('[id="jobDescriptionText"], [class*="description"]');
    if (indeedDesc?.textContent) {
      const text = indeedDesc.textContent.trim();
      if (text.length > 100) {
        console.log('Found Indeed job description');
        return text.substring(0, 3000);
      }
    }

    // Try to find largest text block (excluding common noise)
    const allDivs = document.querySelectorAll('div, article, section, main, [role="main"]');
    let largestText = '';

    allDivs.forEach((el) => {
      const text = el.textContent?.trim() || '';
      // Look for substantial blocks of text (job descriptions are usually lengthy)
      if (text.length > largestText.length && 
          text.length > 150 && 
          text.length < 10000 &&
          this.isLikelyJobDescription(text)) {
        largestText = text;
      }
    });

    if (largestText.length > 100) {
      console.log('Found generic large text block');
      return largestText.substring(0, 3000);
    }

    console.log('No substantial description found');
    return '';
  }

  private isLikelyJobDescription(text: string): boolean {
    // Filter out navigation, footer, cookie notices, etc.
    const lowerText = text.toLowerCase();
    const blocklist = [
      '© ',
      'copyright',
      'subscribe',
      'cookie',
      'accept all',
      'privacy policy',
      'terms of service',
      'all rights reserved',
      'sign in',
      'log in',
      'advertisement'
    ];

    for (const blocked of blocklist) {
      if (lowerText.includes(blocked)) {
        return false;
      }
    }

    // Should have some job-related keywords or be substantial
    const jobKeywords = ['experience', 'required', 'responsibilities', 'qualifications', 'skills', 'position', 'role'];
    let matchCount = 0;
    for (const keyword of jobKeywords) {
      if (lowerText.includes(keyword)) {
        matchCount++;
      }
    }

    return matchCount > 0 || text.length > 500;
  }

  private extractRequirements(): string[] {
    const requirements: string[] = [];

    // LinkedIn criteria section
    const linkedInCriteria = document.querySelector('[data-qa="job-details-criteria"]');
    if (linkedInCriteria) {
      const items = linkedInCriteria.querySelectorAll('li');
      items.forEach((item) => {
        if (requirements.length < 15 && item.textContent) {
          const text = item.textContent.trim();
          if (text.length > 5) {
            requirements.push(text);
          }
        }
      });

      if (requirements.length > 0) {
        console.log('Found LinkedIn requirements');
        return requirements;
      }
    }

    // Look for all list items as potential requirements
    const listItems = document.querySelectorAll('li');
    let liCount = 0;
    listItems.forEach((item) => {
      if (requirements.length < 15 && item.textContent) {
        const text = item.textContent.trim();
        if (text.length > 10 && text.length < 500) {
          requirements.push(text);
          liCount++;
        }
      }
    });

    if (liCount > 0) {
      console.log('Found list item requirements:', liCount);
      return requirements;
    }

    console.log('No specific requirements found');
    return requirements;
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureJobListing') {
    try {
      console.log('Content script received captureJobListing request');
      const extractor = new JobListingExtractor();
      const jobListing = extractor.extractJobListing();

      if (jobListing) {
        console.log('Content script sending job listing:', jobListing);
        sendResponse({ jobListing });
      } else {
        console.log('Content script: Failed to extract job listing - missing required fields');
        sendResponse({ error: 'Could not extract job listing from this page' });
      }
    } catch (error) {
      console.error('Content script error during job extraction:', error);
      sendResponse({ error: String(error) });
    }
  }
});

console.log('Content script loaded');
