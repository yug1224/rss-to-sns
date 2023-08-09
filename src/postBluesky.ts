import AtprotoAPI, { RichText } from 'npm:@atproto/api';
const { BskyAgent } = AtprotoAPI;
const service = 'https://bsky.social';
const agent = new BskyAgent({ service });
const identifier = Deno.env.get('BLUESKY_IDENTIFIER') || '';
const password = Deno.env.get('BLUESKY_PASSWORD') || '';
await agent.login({ identifier, password });

export default async ({
  rt,
  images,
}: {
  rt: RichText;
  images?: {
    mimeType: string;
    image: Uint8Array;
  }[];
}) => {
  const embed = await (async () => {
    // 画像がない場合はreturn
    if (!images) return;

    const uploadedImages = [];
    for await (const { mimeType, image } of images) {
      // 画像をアップロード
      const uploadedImage = await agent.uploadBlob(image, {
        encoding: mimeType,
      });

      uploadedImages.push({
        image: {
          cid: uploadedImage.data.blob.ref.toString(),
          mimeType: uploadedImage.data.blob.mimeType,
        },
        alt: '',
      });
    }

    return {
      $type: 'app.bsky.embed.images',
      images: uploadedImages,
    };
  })();

  const postObj: Partial<AtprotoAPI.AppBskyFeedPost.Record> &
    Omit<AtprotoAPI.AppBskyFeedPost.Record, 'createdAt'> = {
    $type: 'app.bsky.feed.post',
    text: rt.text,
    facets: rt.facets,
    embed,
  };

  console.log(JSON.stringify(postObj, null, 2));
  await agent.post(postObj);
  console.log('post to Bluesky');
};
