# Cover Letter Generator Chrome Extension

A Chrome extension that helps you create tailored cover letters for job applications by leveraging your resume and the job listing details.

## Features

- **Resume Upload**: Upload and save your resume (PDF, DOC, DOCX) to Chrome storage
- **Job Description Extraction**: Automatically extract job details from any job listing page
- **AI-Powered Cover Letters**: Generate tailored cover letters that match job requirements
- **Word Document Export**: Download your cover letter as a formatted Word document
- **One-Click Generation**: Simple UI that makes creating cover letters quick and easy

## Project Structure

```
├── manifest.json           # Chrome extension configuration
├── package.json           # Dependencies and build scripts
├── tsconfig.json          # TypeScript configuration
├── webpack.config.js      # Build configuration
├── src/
│   ├── types/            # TypeScript type definitions
│   ├── popup/            # Extension popup UI and logic
│   ├── content/          # Content script for page interaction
│   └── background/       # Service worker for processing
└── public/
    ├── popup.html        # Popup UI
    └── icons/            # Extension icons
```

## Installation & Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the extension:**
   ```bash
   npm run build
   ```

3. **Load in Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select this project folder

## Development

### Build in watch mode:
```bash
npm run dev
```

### Build for production:
```bash
npm run build
```

## How to Use

1. Click the extension icon in your Chrome toolbar
2. Upload your resume (PDF, DOC, or DOCX)
3. Navigate to a job listing page
4. Click "Generate Cover Letter"
5. Your cover letter will be downloaded as a Word document

## Implementation Notes

### Resume Storage
Resumes are stored in Chrome's local storage API (`chrome.storage.local`). The file is converted to base64 for storage.

### Job Extraction
The content script uses CSS selectors to extract job information from various job board formats. You can enhance this with more specific selectors for popular job sites.

### Cover Letter Generation
Currently uses a template system. For production, integrate with:
- OpenAI API (GPT-4)
- Google's Gemini API
- Another LLM service of your choice

### Word Document Export
Uses the `docx` library to generate properly formatted Word documents. The extension uses Chrome's downloads API to trigger file downloads.

## Future Enhancements

- [ ] Integration with OpenAI API for AI-powered cover letter generation
- [ ] Support for multiple resume versions
- [ ] Cover letter template customization
- [ ] Automatic job board detection for better extraction
- [ ] Cover letter history and management
- [ ] Browser support for Firefox and Edge

## Permissions Used

- `storage` - Store resume data locally
- `activeTab` - Access current tab for job listing
- `scripting` - Run content scripts on pages
- `<all_urls>` - Work on any website with job listings

## License

MIT
