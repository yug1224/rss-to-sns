import { FileMetadataResponse, GoogleAIFileManager } from 'npm:@google/generative-ai/server';
import { GoogleGenerativeAI } from 'npm:@google/generative-ai';

const systemInstruction = `
- あなたは技術ドキュメントの要約に特化したアシスタントです
- 主要な3つのポイントを抽出してください
- 各項目は30文字以内で1行で記述してください
- 各項目は必ず異なる内容にしてください
- 3つの項目の合計文字数は100文字以内としてください
- 目次・広告・リコメンドなど、メインの内容とは関係ない部分は要約に含めないでください
- 要約は「-」を使った箇条書きの記法に統一してください
- 文末表現は「体言止め」に統一してください
- 文末に句点「。」を付けないでください
- 出力は日本語で要約結果のみを出力してください
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

export default async (path: string): Promise<string> => {
  const retry = async (retryCount = 0) => {
    try {
      const modelName = Deno.env.get('GEMINI_MODEL') || 'gemini-2.0-flash';
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
      });

      const files = [
        await uploadToGemini(
          path,
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
      const responseText = result.response.text().trim();
      const [summary] = responseText.match(/^-\s.*$\n^-\s.*$\n^-\s.*$/m) || [''];
      console.log('Success createPDFSummary');
      console.log(summary);

      return summary;
    } catch (e) {
      console.error(e);

      if (retryCount >= 5) {
        throw new Error('Failed createPDFSummary');
      }

      // リトライ処理
      console.log(`Retry createPDFSummary`);
      return await retry(retryCount + 1);
    }
  };
  return await retry();
};
