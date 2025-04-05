import {
  ImageMagick,
  IMagickImage,
  initialize,
  MagickFormat,
} from 'https://deno.land/x/imagemagick_deno@0.0.31/mod.ts';

export default async (url: string, timestamp: number) => {
  try {
    const fetchRetry = async (url: string, retryCount = 0): Promise<Response | undefined> => {
      const response = await fetch(url);
      const contentType = response.headers.get('content-type') || '';

      // 画像が取得できなかった場合
      if (!response.ok || !contentType?.includes('image')) {
        if (retryCount >= 5) return;

        // リトライ処理
        console.log(`Retry getImage`);
        return await fetchRetry(url, retryCount + 1);
      }
      return response;
    };
    const response = await fetchRetry(url);
    if (!response) {
      console.log('Failed getImage');
      return {};
    }
    const buffer = await response.arrayBuffer();

    const resizeRetry = async ({
      buffer,
      retryCount = 0,
    }: {
      buffer: ArrayBuffer;
      retryCount?: number;
    }): Promise<{ mimeType?: string; resizedImage?: Uint8Array }> => {
      await initialize();

      const maxWidth = 2000;
      const maxHeight = 2000;
      const maxByteLength = 976.56 * 1000;
      const mimeType = 'image/avif';

      const resizedImage = await ImageMagick.read(new Uint8Array(buffer), async (img: IMagickImage) => {
        img.resize(maxWidth, maxHeight);
        img.quality = 100 - (retryCount * 2);

        await img.write(MagickFormat.Avif, async (data: Uint8Array) => {
          await Deno.writeFile(`${timestamp}.avif`, data);
          return;
        });
        const resized = await Deno.readFile(`${timestamp}.avif`);
        return resized;
      });

      console.log('resizedImage.byteLength', resizedImage.byteLength);
      if (resizedImage && resizedImage.byteLength > maxByteLength) {
        // リトライ処理
        console.log('Retry resizedImage');
        return await resizeRetry({ buffer, retryCount: retryCount + 1 });
      }
      return { mimeType, resizedImage };
    };
    const { mimeType, resizedImage } = await resizeRetry({ buffer });

    console.log('Success resizeImage');
    return {
      mimeType,
      resizedImage,
    };
  } catch (e) {
    console.error(e);

    // 画像のリサイズに失敗した場合は空オブジェクトを返す
    console.log('Failed resizeImage');
    return {};
  }
};
