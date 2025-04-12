import { abortable } from 'jsr:@std/async';
import AtprotoAPI, { AtpAgent, type BlobRef, RichText } from 'npm:@atproto/api';

export default async ({
  agent,
  rt,
  title,
  link,
  description,
  mimeType,
  image,
}: {
  agent: AtpAgent;
  rt: RichText;
  title: string;
  link: string;
  description: string;
  mimeType?: string;
  image?: Uint8Array;
}) => {
  const thumb: BlobRef | undefined = await (async () => {
    if (!(image instanceof Uint8Array && typeof mimeType === 'string')) return;
    console.log(
      JSON.stringify(
        { imageByteLength: image.byteLength, encoding: mimeType },
        null,
        2,
      ),
    );

    const uploadRetry = async (retryCount = 0): Promise<BlobRef | undefined> => {
      try {
        const c = new AbortController();
        // 10秒でタイムアウト
        const timer = setTimeout(() => {
          console.log('timeout to upload image');
          return c.abort();
        }, 1000 * 10 * (retryCount + 1));

        // 画像をアップロード
        const uploadedImage = await abortable(
          agent.uploadBlob(image, {
            encoding: mimeType,
          }),
          c.signal,
        );
        console.log('Success uploadImage');
        clearTimeout(timer);

        // 投稿オブジェクトに画像を追加
        return uploadedImage.data.blob;
      } catch (e) {
        console.error(e);

        if (retryCount >= 5) {
          console.log('Failed uploadImage');
          return;
        }

        // リトライ処理
        console.log(`Retry uploadImage`);
        return await uploadRetry(retryCount + 1);
      }
    };
    return await uploadRetry();
  })();

  const postObj:
    & Partial<AtprotoAPI.AppBskyFeedPost.Record>
    & Omit<AtprotoAPI.AppBskyFeedPost.Record, 'createdAt'> = {
      $type: 'app.bsky.feed.post',
      text: rt.text,
      facets: rt.facets,
      embed: {
        $type: 'app.bsky.embed.external',
        external: {
          uri: link,
          title,
          description: '', // 一時的にdescriptionは空にする
          thumb,
        },
      },
      langs: ['ja'],
    };

  console.log('postObj', JSON.stringify(postObj, null, 2));
  await agent.post(postObj);
  console.log('Success postBluesky');
};
