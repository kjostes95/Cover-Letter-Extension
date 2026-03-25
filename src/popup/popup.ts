import { AISettings, DownloadSettings, JobListing, Resume } from '../types/index';

interface DraftState {
  coverLetterContent: string;
  jobListing: JobListing;
  usedAI: boolean;
  updatedAt: number;
}

function getDefaultDownloadSettings(): DownloadSettings {
  return {
    useSelectedFolder: false,
    selectedFolderName: ''
  };
}

const HANDLE_DB_NAME = 'cover-letter-generator';
const HANDLE_STORE_NAME = 'handles';
const DOWNLOAD_FOLDER_HANDLE_KEY = 'download-folder';

type FilePermissionState = 'granted' | 'denied' | 'prompt';

interface WritableDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<FilePermissionState>;
  requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<FilePermissionState>;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: () => Promise<WritableDirectoryHandle>;
}

function openHandleDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(HANDLE_STORE_NAME)) {
        database.createObjectStore(HANDLE_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDownloadFolderHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const database = await openHandleDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(HANDLE_STORE_NAME, 'readwrite');
    transaction.objectStore(HANDLE_STORE_NAME).put(handle, DOWNLOAD_FOLDER_HANDLE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  database.close();
}

async function loadDownloadFolderHandle(): Promise<FileSystemDirectoryHandle | null> {
  const database = await openHandleDatabase();

  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const transaction = database.transaction(HANDLE_STORE_NAME, 'readonly');
    const request = transaction.objectStore(HANDLE_STORE_NAME).get(DOWNLOAD_FOLDER_HANDLE_KEY);
    request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) || null);
    request.onerror = () => reject(request.error);
  });

  database.close();
  return handle;
}

async function clearDownloadFolderHandle(): Promise<void> {
  const database = await openHandleDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(HANDLE_STORE_NAME, 'readwrite');
    transaction.objectStore(HANDLE_STORE_NAME).delete(DOWNLOAD_FOLDER_HANDLE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  database.close();
}

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

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

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function inferResumeNameFromFileName(fileName: string): Pick<Resume, 'name' | 'firstName' | 'lastName'> {
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const parts = baseName
    .split(/[^a-zA-Z]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
    .filter((part) => !RESUME_NAME_STOP_WORDS.has(part.toLowerCase()));

  if (parts.length === 0) {
    return {};
  }

  if (parts.length === 1) {
    const firstName = toTitleCase(parts[0]);
    return {
      name: firstName,
      firstName,
      lastName: firstName
    };
  }

  const firstName = toTitleCase(parts[0]);
  const lastName = toTitleCase(parts[1]);
  const name = `${firstName} ${lastName}`;

  return { name, firstName, lastName };
}

class PopupApp {
  private resumeInput: HTMLInputElement | null = null;
  private generateButton: HTMLButtonElement | null = null;
  private resumeStatusText: HTMLDivElement | null = null;
  private resultText: HTMLDivElement | null = null;
  private uploadArea: HTMLDivElement | null = null;
  private aiEnabledInput: HTMLInputElement | null = null;
  private apiKeyInput: HTMLInputElement | null = null;
  private endpointInput: HTMLInputElement | null = null;
  private modelSelect: HTMLSelectElement | null = null;
  private modelInput: HTMLInputElement | null = null;
  private saveAiSettingsButton: HTMLButtonElement | null = null;
  private draftPanel: HTMLDivElement | null = null;
  private draftEditor: HTMLTextAreaElement | null = null;
  private regenerateButton: HTMLButtonElement | null = null;
  private downloadDraftButton: HTMLButtonElement | null = null;
  private activityText: HTMLDivElement | null = null;
  private useSelectedFolderInput: HTMLInputElement | null = null;
  private folderAreaButton: HTMLDivElement | null = null;
  private selectedFolderTitle: HTMLSpanElement | null = null;
  private selectedFolderSubtitle: HTMLSpanElement | null = null;
  private saveDownloadSettingsButton: HTMLButtonElement | null = null;
  private currentJobListing: JobListing | null = null;
  private currentDraftUsedAI = false;
  private selectedFolderHandle: WritableDirectoryHandle | null = null;
  private hasResume = false;
  private isBusy = false;
  private draftSaveTimer: number | null = null;

  private static splitFileName(fileName: string): { base: string; extension: string } {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot <= 0) {
      return { base: fileName, extension: '' };
    }

    return {
      base: fileName.slice(0, lastDot),
      extension: fileName.slice(lastDot)
    };
  }

  constructor() {
    this.initializeElements();
    this.attachEventListeners();
    this.setBusy(false);
    this.loadResumeStatus();
    this.loadAISettings();
    this.loadDownloadSettings();
    this.loadSavedDraftState();
  }

  private initializeElements(): void {
    this.resumeInput = document.getElementById('resumeInput') as HTMLInputElement;
    this.generateButton = document.getElementById('generateButton') as HTMLButtonElement;
    this.resumeStatusText = document.getElementById('resumeStatusText') as HTMLDivElement;
    this.resultText = document.getElementById('resultText') as HTMLDivElement;
    this.uploadArea = document.getElementById('uploadAreaButton') as HTMLDivElement;
    this.aiEnabledInput = document.getElementById('aiEnabled') as HTMLInputElement;
    this.apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
    this.endpointInput = document.getElementById('endpointInput') as HTMLInputElement;
    this.modelSelect = document.getElementById('modelSelect') as HTMLSelectElement;
    this.modelInput = document.getElementById('modelInput') as HTMLInputElement;
    this.saveAiSettingsButton = document.getElementById('saveAiSettingsButton') as HTMLButtonElement;
    this.draftPanel = document.getElementById('draftPanel') as HTMLDivElement;
    this.draftEditor = document.getElementById('draftEditor') as HTMLTextAreaElement;
    this.regenerateButton = document.getElementById('regenerateButton') as HTMLButtonElement;
    this.downloadDraftButton = document.getElementById('downloadDraftButton') as HTMLButtonElement;
    this.activityText = document.getElementById('activityText') as HTMLDivElement;
    this.useSelectedFolderInput = document.getElementById('useSelectedFolder') as HTMLInputElement;
    this.folderAreaButton = document.getElementById('folderAreaButton') as HTMLDivElement;
    this.selectedFolderTitle = document.getElementById('selectedFolderTitle') as HTMLSpanElement;
    this.selectedFolderSubtitle = document.getElementById('selectedFolderSubtitle') as HTMLSpanElement;
    this.saveDownloadSettingsButton = document.getElementById('saveDownloadSettingsButton') as HTMLButtonElement;
  }

  private attachEventListeners(): void {
    if (this.uploadArea) {
      this.uploadArea.addEventListener('click', () => this.resumeInput?.click());
    }
    if (this.resumeInput) {
      this.resumeInput.addEventListener('change', (e) => this.handleResumeUpload(e));
    }
    if (this.generateButton) {
      this.generateButton.addEventListener('click', () => this.handleGenerateCoverLetter());
    }
    if (this.saveAiSettingsButton) {
      this.saveAiSettingsButton.addEventListener('click', () => this.handleSaveAISettings());
    }
    if (this.aiEnabledInput) {
      this.aiEnabledInput.addEventListener('change', () => this.saveAISettings(false));
    }
    if (this.apiKeyInput) {
      this.apiKeyInput.addEventListener('change', () => this.saveAISettings(false));
    }
    if (this.endpointInput) {
      this.endpointInput.addEventListener('change', () => this.saveAISettings(false));
    }
    if (this.modelSelect) {
      this.modelSelect.addEventListener('change', () => this.handleModelSelectionChange());
    }
    if (this.modelInput) {
      this.modelInput.addEventListener('change', () => this.saveAISettings(false));
    }
    if (this.downloadDraftButton) {
      this.downloadDraftButton.addEventListener('click', () => this.handleDownloadDraft());
    }
    if (this.regenerateButton) {
      this.regenerateButton.addEventListener('click', () => this.handleRegenerateDraft());
    }
    if (this.draftEditor) {
      this.draftEditor.addEventListener('input', () => this.scheduleDraftAutosave());
    }
    if (this.useSelectedFolderInput) {
      this.useSelectedFolderInput.addEventListener('change', () => this.handleSelectedFolderToggle());
    }
    if (this.folderAreaButton) {
      this.folderAreaButton.addEventListener('click', () => {
        void this.handleChooseFolder();
      });
    }
    if (this.saveDownloadSettingsButton) {
      this.saveDownloadSettingsButton.addEventListener('click', () => this.handleSaveDownloadSettings());
    }
  }

  private loadSavedDraftState(): void {
    chrome.storage.local.get(['draftState'], (result) => {
      const draftState = result.draftState as DraftState | undefined;
      if (!draftState?.coverLetterContent || !draftState.jobListing) {
        return;
      }

      this.currentJobListing = draftState.jobListing;
      this.currentDraftUsedAI = Boolean(draftState.usedAI);
      if (this.draftEditor) {
        this.draftEditor.value = draftState.coverLetterContent;
      }
      if (this.draftPanel) {
        this.draftPanel.classList.add('visible');
      }

      const draftMode = draftState.usedAI ? 'AI' : 'Template';
      this.showResult(`${draftMode} draft restored - review and click Download .docx`, 'info');

      this.setBusy(false);
    });
  }

  private loadDownloadSettings(): void {
    chrome.storage.local.get(['downloadSettings'], async (result) => {
      const settings = (result.downloadSettings as DownloadSettings | undefined) || getDefaultDownloadSettings();

      try {
        this.selectedFolderHandle = await loadDownloadFolderHandle() as WritableDirectoryHandle | null;
      } catch (error) {
        console.error('Error loading saved folder handle:', error);
        this.selectedFolderHandle = null;
      }

      const canUseSelectedFolder = settings.useSelectedFolder && Boolean(this.selectedFolderHandle);

      if (this.useSelectedFolderInput) {
        this.useSelectedFolderInput.checked = canUseSelectedFolder;
      }

      this.renderSelectedFolderArea(
        canUseSelectedFolder ? settings.selectedFolderName || '' : '',
        settings.useSelectedFolder && !canUseSelectedFolder
      );

      if (settings.useSelectedFolder && !canUseSelectedFolder) {
        this.handleSaveDownloadSettings(false);
      }
    });
  }

  private loadAISettings(): void {
    chrome.storage.local.get(['aiSettings'], (result) => {
      const settings = result.aiSettings as AISettings | undefined;
      if (!settings) {
        return;
      }

      if (this.aiEnabledInput) {
        this.aiEnabledInput.checked = settings.enabled;
      }
      if (this.apiKeyInput) {
        this.apiKeyInput.value = settings.apiKey || '';
      }
      if (this.endpointInput) {
        this.endpointInput.value = settings.endpoint || 'https://api.openai.com/v1/chat/completions';
      }
      if (this.modelInput) {
        this.modelInput.value = settings.model || 'gpt-4.1-mini';
      }

      const presetModels = ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'];
      if (this.modelSelect) {
        this.modelSelect.value = presetModels.includes(settings.model) ? settings.model : 'custom';
      }

      this.syncModelInputVisibility();
    });
  }

  private getCurrentAISettings(): AISettings {
    const selectedModel = this.modelSelect?.value || 'gpt-4.1-mini';
    const resolvedModel = selectedModel === 'custom'
      ? this.modelInput?.value.trim() || 'gpt-4.1-mini'
      : selectedModel;

    return {
      enabled: Boolean(this.aiEnabledInput?.checked),
      apiKey: this.apiKeyInput?.value.trim() || '',
      endpoint: this.endpointInput?.value.trim() || 'https://api.openai.com/v1/chat/completions',
      model: resolvedModel
    };
  }

  private saveAISettings(showStatus: boolean, onSaved?: () => void): void {
    const settings = this.getCurrentAISettings();
    chrome.storage.local.set({ aiSettings: settings }, () => {
      if (showStatus) {
        this.showResult(settings.enabled ? 'AI settings saved' : 'AI disabled; template mode active', 'success');
      }
      onSaved?.();
    });
  }

  private handleSaveAISettings(): void {
    this.saveAISettings(true);
  }

  private getCurrentDownloadSettings(): DownloadSettings {
    return {
      useSelectedFolder: Boolean(this.useSelectedFolderInput?.checked),
      selectedFolderName: this.selectedFolderSubtitle?.dataset.folderName || ''
    };
  }

  private handleModelSelectionChange(): void {
    this.syncModelInputVisibility();
    this.saveAISettings(false);
  }

  private syncModelInputVisibility(): void {
    if (!this.modelInput || !this.modelSelect) {
      return;
    }

    const isCustomModel = this.modelSelect.value === 'custom';
    this.modelInput.style.display = isCustomModel ? 'block' : 'none';
  }

  private handleSelectedFolderToggle(): void {
    if (this.useSelectedFolderInput?.checked && !this.selectedFolderHandle) {
      this.showResult('Choose a folder first to enable selected-folder saving', 'error');
      if (this.useSelectedFolderInput) {
        this.useSelectedFolderInput.checked = false;
      }
    }
    this.handleSaveDownloadSettings(false);
  }

  private handleSaveDownloadSettings(showStatus = true, onSaved?: () => void): void {
    const settings = this.getCurrentDownloadSettings();
    const resolvedSettings = settings.useSelectedFolder && !settings.selectedFolderName
      ? getDefaultDownloadSettings()
      : settings;

    if (settings.useSelectedFolder && !settings.selectedFolderName && this.useSelectedFolderInput) {
      this.useSelectedFolderInput.checked = false;
    }

    chrome.storage.local.set({ downloadSettings: resolvedSettings }, () => {
      if (showStatus) {
        this.showResult(
          settings.useSelectedFolder && !settings.selectedFolderName
            ? 'Choose a folder first to enable selected-folder saving'
            : resolvedSettings.useSelectedFolder
              ? `Selected folder enabled: ${resolvedSettings.selectedFolderName || 'folder selected'}`
              : 'Save location reset to browser default Downloads behavior',
          settings.useSelectedFolder && !settings.selectedFolderName ? 'error' : 'success'
        );
      }
      onSaved?.();
    });
  }

  private loadResumeStatus(): void {
    chrome.storage.local.get(['resume'], (result) => {
      if (result.resume) {
        const resume = result.resume as Resume;
        this.hasResume = true;
        this.updateResumeStatus(`Resume loaded: ${resume.fileName}`);
        if (this.generateButton) {
          this.generateButton.disabled = this.isBusy;
        }
      } else {
        this.hasResume = false;
        this.updateResumeStatus('No resume uploaded');
        if (this.generateButton) {
          this.generateButton.disabled = true;
        }
      }
    });
  }

  private handleResumeUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const inferredName = inferResumeNameFromFileName(file.name);
      const resume: Resume = {
        id: Date.now().toString(),
        fileName: file.name,
        fileData: content.split(',')[1], // Extract base64 content
        ...inferredName,
        uploadedAt: Date.now()
      };

      chrome.storage.local.set({ resume }, () => {
        this.hasResume = true;
        this.updateResumeStatus(`Resume uploaded: ${file.name}`);
        this.showResult('Resume uploaded successfully', 'success');
        if (this.generateButton) {
          this.generateButton.disabled = this.isBusy;
        }
      });
    };

    reader.readAsDataURL(file);
  }

  private handleGenerateCoverLetter(): void {
    if (this.isBusy) {
      return;
    }

    this.setBusy(true, 'Capturing job listing...');

    this.saveAISettings(false, () => {
      this.handleSaveDownloadSettings(false, () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0].id) {
        this.setBusy(false);
        this.showResult('Error: Could not identify active tab', 'error');
        return;
      }

      console.log('Sending captureJobListing message to tab:', tabs[0].id);

      this.captureJobListingFromTab(tabs[0].id, false, (response, errorMessage) => {
        if (errorMessage) {
          this.setBusy(false);
          this.showResult(`Error: ${errorMessage}`, 'error');
          return;
        }

        console.log('Response from content script:', response);

        if (response && response.jobListing) {
          this.currentJobListing = response.jobListing as JobListing;
          this.requestDraftGeneration(
            this.currentJobListing,
            'Generating draft (AI may take up to 30 seconds)...'
          );
        } else if (response && response.error) {
          this.setBusy(false);
          this.showResult(`Error: ${response.error}`, 'error');
        } else {
          this.setBusy(false);
          this.showResult('Could not extract job listing from page', 'error');
        }
      });
    });
      });
    });
  }

  private captureJobListingFromTab(
    tabId: number,
    hasRetriedAfterInjection: boolean,
    callback: (response: any, errorMessage?: string) => void
  ): void {
    chrome.tabs.sendMessage(tabId, { action: 'captureJobListing' }, (response) => {
      const runtimeError = chrome.runtime.lastError?.message;
      if (runtimeError) {
        console.error('Message sending error:', runtimeError);

        const needsInjection = runtimeError.includes('Receiving end does not exist');
        if (needsInjection && !hasRetriedAfterInjection) {
          this.showResult('Initializing page scripts...', 'info');
          this.injectContentScriptIntoTab(tabId, (injectError) => {
            if (injectError) {
              callback(null, injectError);
              return;
            }

            this.captureJobListingFromTab(tabId, true, callback);
          });
          return;
        }

        callback(null, runtimeError);
        return;
      }

      callback(response);
    });
  }

  private handleRegenerateDraft(): void {
    if (!this.currentJobListing) {
      this.showResult('Error: No saved job listing found. Generate a draft first.', 'error');
      return;
    }

    if (this.isBusy) {
      return;
    }

    this.requestDraftGeneration(
      this.currentJobListing,
      'Regenerating draft (AI may take up to 30 seconds)...'
    );
  }

  private injectContentScriptIntoTab(
    tabId: number,
    callback: (errorMessage?: string) => void
  ): void {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ['dist/content.js']
      },
      () => {
        const runtimeError = chrome.runtime.lastError?.message;
        if (runtimeError) {
          console.error('Content script injection error:', runtimeError);

          if (runtimeError.includes('Cannot access')) {
            callback('This page is restricted. Open a job listing on a regular website (https://...) and try again.');
            return;
          }

          callback(runtimeError);
          return;
        }

        // Give the injected script a brief moment to attach listeners.
        setTimeout(() => callback(), 75);
      }
    );
  }

  private handleDownloadDraft(): void {
    if (!this.currentJobListing) {
      this.showResult('Error: Generate a draft first', 'error');
      return;
    }

    const coverLetterContent = this.draftEditor?.value.trim() || '';
    if (!coverLetterContent) {
      this.showResult('Error: Draft text is empty', 'error');
      return;
    }

    this.setBusy(true, 'Exporting and downloading document...');

    this.persistDraftState({
      coverLetterContent,
      jobListing: this.currentJobListing,
      usedAI: this.currentDraftUsedAI,
      updatedAt: Date.now()
    });

    if (this.useSelectedFolderInput?.checked) {
      void this.saveDraftToSelectedFolder(coverLetterContent, this.currentJobListing);
      return;
    }
    this.startBrowserDownload(coverLetterContent, this.currentJobListing);
  }


  private startBrowserDownload(coverLetterContent: string, jobListing: JobListing): void {
    const port = chrome.runtime.connect({ name: 'coverLetter' });

    port.onMessage.addListener((bgResponse) => {
      this.setBusy(false);

      if (bgResponse && bgResponse.success) {
        this.showResult('Download started', 'success');
      } else {
        this.showResult(`Error: ${bgResponse?.error || 'Unknown error'}`, 'error');
      }

      port.disconnect();
    });

    port.onDisconnect.addListener(() => {
      this.setBusy(false);

      if (chrome.runtime.lastError) {
        console.error('Port disconnected with error:', chrome.runtime.lastError);
        this.showResult('Error contacting background service', 'error');
      }
    });

    port.postMessage({
      action: 'downloadCoverLetter',
      coverLetterContent,
      jobListing
    });
  }

  private async handleChooseFolder(): Promise<void> {
    const pickerWindow = window as DirectoryPickerWindow;
    if (typeof pickerWindow.showDirectoryPicker !== 'function') {
      this.showResult('Folder picker is not available in this browser context', 'error');
      return;
    }

    try {
      const directoryHandle = await pickerWindow.showDirectoryPicker();
      this.selectedFolderHandle = directoryHandle;
      await saveDownloadFolderHandle(directoryHandle);

      if (this.useSelectedFolderInput) {
        this.useSelectedFolderInput.checked = true;
      }

      this.renderSelectedFolderArea(directoryHandle.name, false);

      this.handleSaveDownloadSettings(true);
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') {
        return;
      }

      console.error('Error choosing folder:', error);
      this.showResult('Error choosing folder', 'error');
    }
  }

  private async saveDraftToSelectedFolder(
    coverLetterContent: string,
    jobListing: JobListing
  ): Promise<void> {
    try {
      console.log('Popup: Saving draft to selected folder...');
      const directoryHandle = this.selectedFolderHandle || await loadDownloadFolderHandle() as WritableDirectoryHandle | null;
      if (!directoryHandle) {
        console.warn('Popup: No selected folder handle found, falling back to browser download');
        this.showResult('Selected folder unavailable, falling back to browser download...', 'info');
        this.startBrowserDownload(coverLetterContent, jobListing);
        return;
      }

      this.selectedFolderHandle = directoryHandle;

      const permission = await directoryHandle.queryPermission({ mode: 'readwrite' });
      const granted = permission === 'granted'
        ? 'granted'
        : await directoryHandle.requestPermission({ mode: 'readwrite' });

      if (granted !== 'granted') {
        console.warn('Popup: Folder permission not granted, falling back to browser download');
        this.showResult('Folder permission not granted, falling back to browser download...', 'info');
        this.startBrowserDownload(coverLetterContent, jobListing);
        return;
      }

      const exportResult = await this.requestCoverLetterExport(coverLetterContent, jobListing);
      const availableFileName = await this.getAvailableFileName(directoryHandle, exportResult.filename);
      console.log('Popup: Exported cover letter, writing file:', availableFileName);
      const fileHandle = await directoryHandle.getFileHandle(availableFileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(new Blob([decodeBase64ToArrayBuffer(exportResult.base64Document)]));
      await writable.close();

      this.setBusy(false);
      this.showResult(`Saved to selected folder: ${availableFileName}`, 'success');
    } catch (error) {
      console.error('Error saving to selected folder:', error);
      this.showResult('Selected-folder save failed, falling back to browser download...', 'info');
      this.startBrowserDownload(coverLetterContent, jobListing);
    }
  }

  private requestCoverLetterExport(
    coverLetterContent: string,
    jobListing: JobListing
  ): Promise<{ filename: string; base64Document: string }> {
    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: 'coverLetter' });

      port.onMessage.addListener((bgResponse) => {
        console.log('Popup: exportCoverLetterFile response:', bgResponse);
        port.disconnect();

        if (bgResponse && bgResponse.success && bgResponse.base64Document && bgResponse.filename) {
          resolve({
            filename: bgResponse.filename as string,
            base64Document: bgResponse.base64Document as string
          });
          return;
        }

        reject(new Error(bgResponse?.error || 'Failed to export cover letter'));
      });

      port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        }
      });

      port.postMessage({
        action: 'exportCoverLetterFile',
        coverLetterContent,
        jobListing
      });
    });
  }

  private requestDraftGeneration(jobListing: JobListing, activityMessage: string): void {
    this.setBusy(true, activityMessage);

    const port = chrome.runtime.connect({ name: 'coverLetter' });

    port.onMessage.addListener((bgResponse) => {
      console.log('Background response:', bgResponse);
      this.setBusy(false);

      if (bgResponse && bgResponse.success) {
        if (this.draftEditor) {
          this.draftEditor.value = bgResponse.coverLetterContent || '';
        }
        if (this.draftPanel) {
          this.draftPanel.classList.add('visible');
        }

        this.currentDraftUsedAI = Boolean(bgResponse.usedAI);

        this.persistDraftState({
          coverLetterContent: bgResponse.coverLetterContent || '',
          jobListing,
          usedAI: this.currentDraftUsedAI,
          updatedAt: Date.now()
        });

        const modeText = bgResponse.usedAI ? 'AI draft ready' : 'Template draft ready';
        this.showResult(`${modeText} - review and click Download .docx`, 'success');
      } else {
        this.showResult(`Error: ${bgResponse?.error || 'Unknown error'}`, 'error');
      }

      port.disconnect();
    });

    port.onDisconnect.addListener(() => {
      if (chrome.runtime.lastError) {
        this.setBusy(false);
        console.error('Port disconnected with error:', chrome.runtime.lastError);
        this.showResult('Error contacting background service', 'error');
      }
    });

    port.postMessage({
      action: 'generateCoverLetterDraft',
      jobListing
    });
  }

  private scheduleDraftAutosave(): void {
    if (this.draftSaveTimer) {
      window.clearTimeout(this.draftSaveTimer);
    }

    this.draftSaveTimer = window.setTimeout(() => {
      if (!this.currentJobListing || !this.draftEditor) {
        return;
      }

      const coverLetterContent = this.draftEditor.value.trim();
      if (!coverLetterContent) {
        return;
      }

      this.persistDraftState({
        coverLetterContent,
        jobListing: this.currentJobListing,
        usedAI: this.currentDraftUsedAI,
        updatedAt: Date.now()
      });
    }, 250);
  }

  private persistDraftState(draftState: DraftState): void {
    chrome.storage.local.set({ draftState });
  }

  private setBusy(isBusy: boolean, activityMessage = 'Working...'): void {
    this.isBusy = isBusy;

    if (this.generateButton) {
      this.generateButton.disabled = isBusy || !this.hasResume;
      this.generateButton.textContent = isBusy ? 'Working...' : 'Generate Draft';
    }

    if (this.downloadDraftButton) {
      this.downloadDraftButton.disabled = isBusy;
      this.downloadDraftButton.textContent = isBusy ? 'Working...' : 'Download .docx';
    }

    if (this.regenerateButton) {
      this.regenerateButton.disabled = isBusy || !this.currentJobListing;
      this.regenerateButton.textContent = isBusy ? 'Working...' : 'Regenerate Draft';
    }

    if (this.saveDownloadSettingsButton) {
      this.saveDownloadSettingsButton.disabled = isBusy;
    }

    if (this.useSelectedFolderInput) {
      this.useSelectedFolderInput.disabled = isBusy;
    }

    if (this.folderAreaButton) {
      this.folderAreaButton.classList.toggle('disabled', isBusy);
    }

    if (this.activityText) {
      this.activityText.textContent = activityMessage;
      this.activityText.classList.toggle('visible', isBusy);
    }
  }

  private updateResumeStatus(message: string): void {
    if (this.resumeStatusText) {
      this.resumeStatusText.textContent = message;
    }
  }

  private async getAvailableFileName(
    directoryHandle: WritableDirectoryHandle,
    requestedFileName: string
  ): Promise<string> {
    const { base, extension } = PopupApp.splitFileName(requestedFileName);
    let suffix = 0;

    while (suffix < 500) {
      const candidate = suffix === 0
        ? requestedFileName
        : `${base} (${suffix})${extension}`;

      try {
        await directoryHandle.getFileHandle(candidate, { create: false });
        suffix += 1;
      } catch (error) {
        if ((error as DOMException)?.name === 'NotFoundError') {
          return candidate;
        }

        throw error;
      }
    }

    return `${base} (${Date.now()})${extension}`;
  }

  private showResult(message: string, tone: 'success' | 'error' | 'info'): void {
    if (!this.resultText) {
      return;
    }

    this.resultText.textContent = `Last action: ${message}`;
    this.resultText.className = '';
    this.resultText.classList.add(tone);
  }

  private renderSelectedFolderArea(folderName: string, needsRefresh: boolean): void {
    if (!this.selectedFolderTitle || !this.selectedFolderSubtitle) {
      return;
    }

    if (folderName) {
      this.selectedFolderTitle.textContent = 'Selected folder is ready';
      this.selectedFolderSubtitle.textContent = `Current folder: ${folderName}`;
      this.selectedFolderSubtitle.dataset.folderName = folderName;
      return;
    }

    if (needsRefresh) {
      this.selectedFolderTitle.textContent = 'Select folder again';
      this.selectedFolderSubtitle.textContent = 'Your previous folder permission expired or was cleared';
      this.selectedFolderSubtitle.dataset.folderName = '';
      return;
    }

    this.selectedFolderTitle.textContent = 'Click to choose folder';
    this.selectedFolderSubtitle.textContent = 'Currently using browser default Downloads behavior';
    this.selectedFolderSubtitle.dataset.folderName = '';
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupApp();
});
