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

export default async (url: string): Promise<string> => {
  const retry = async (retryCount = 0) => {
    try {
      const modelName = Deno.env.get('GEMINI_MODEL') || 'gemini-2.0-flash';
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction,
      });

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
                  mimeType: 'video/*',
                  fileUri: url,
                },
              },
            ],
          },
        ],
      });

      const result = await chatSession.sendMessage('INSERT_INPUT_HERE');
      const responseText = result.response.text().trim();
      const [summary] = responseText.match(/^-\s.*$\n^-\s.*$\n^-\s.*$/m) || [''];
      console.log('Success createYouTubeSummary');
      console.log(summary);
      return summary;
    } catch (e) {
      console.error(e);

      if (retryCount >= 5) {
        throw new Error('Failed createYouTubeSummary');
      }

      // リトライ処理
      console.log(`Retry createYouTubeSummary`);
      return await retry(retryCount + 1);
    }
  };
  return await retry();
};
