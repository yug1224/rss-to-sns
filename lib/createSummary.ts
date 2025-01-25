import { FileMetadataResponse, GoogleAIFileManager } from 'npm:@google/generative-ai/server';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai';

const systemInstruction = `
- あなたは優秀なソフトウェアエンジニアです
- 箇条書きで3行に要約してください
- 3行の合計文字数は最大140文字にしてください
- 回答のみを日本語でMarkdown形式で出力してください
- 回答が要求どおりになっているか、セルフレビューしてから出力してください
`;

const apiKey = Deno.env.get('GOOGLE_AI_API_KEY') || '';
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

async function uploadToGemini(path: string, mimeType: string) {
  const uploadResult = await fileManager.uploadFile(path, {
    mimeType,
    displayName: path,
  });
  const file = uploadResult.file;
  console.log(`Uploaded file ${file.displayName} as: ${file.name}`);
  return file;
}

async function waitForFilesActive(files: FileMetadataResponse[]) {
  console.log('Waiting for file processing...');
  for (const name of files.map((file) => file.name)) {
    let file = await fileManager.getFile(name);
    while (file.state === 'PROCESSING') {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      file = await fileManager.getFile(name);
    }
    if (file.state !== 'ACTIVE') {
      throw Error(`File ${file.name} failed to process`);
    }
  }
  console.log('...all files ready\n');
}

export default async (): Promise<string> => {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    systemInstruction,
  });

  const files = [
    await uploadToGemini(
      'page.pdf',
      'application/pdf',
    ),
  ];

  await waitForFilesActive(files);

  const generationConfig = {
    temperature: 2,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
    responseMimeType: 'text/plain',
  };

  const chatSession = model.startChat({
    generationConfig,
    history: [
      {
        role: 'user',
        parts: [
          {
            fileData: {
              mimeType: files[0].mimeType,
              fileUri: files[0].uri,
            },
          },
        ],
      },
    ],
  });

  const result = await chatSession.sendMessage('INSERT_INPUT_HERE');
  console.log('Success createSummary');
  return result.response.text();
};
