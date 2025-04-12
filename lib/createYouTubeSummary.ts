import { GoogleGenerativeAI } from 'npm:@google/generative-ai';

const systemInstruction = `
# 役割
あなたは、技術ドキュメントの内容を客観的に紹介するアシスタントです。

# タスク
- 与えられたドキュメントを分析し、その主題や結論を把握してください。
- 把握した内容に基づき、ドキュメントの要点を**あなた自身の言葉で**記述してください。元の文章の表現をそのままコピーすることは避けてください。
- 紹介文は、**客観的な事実**や**技術的なポイント**を中心に構成してください。

# 制約
- 紹介文は最大3つの項目で構成してください。
- 各項目は30文字以内としてください。
- 全体の合計文字数は100文字以内としてください。
- 文末表現は**体言止め**に統一してください。
- 各項目の文末に句点「。」は付けないでください。

# 出力形式
- 各項目はMarkdownの箇条書き形式（例: \`- \`）で始めてください。
- 出力は日本語の紹介文のみとし、他のテキストは含めないでください。

# 注意点
- **著作権法を遵守し、元のドキュメントの創作性を侵害しないよう、表現には十分に注意してください。**
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
