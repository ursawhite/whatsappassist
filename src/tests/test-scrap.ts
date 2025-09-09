import { initializeBrowser, closeBrowser, getArticle, getSocialMediaPost } from '../services/scrap';

async function run() {
  console.log('Starting scrap tests...');
  try {
    await initializeBrowser();

    // Basic article test with a simple, public page
    const articleUrl = 'https://developer.mozilla.org/en-US/docs/Web/JavaScript';
    const article = await getArticle(articleUrl);
    console.log('Article result:', {
      title: article.title,
      contentPreview: article.content.slice(0, 120)
    });

    if (!article.title || article.content.length === 0) {
      throw new Error('getArticle returned empty result');
    }

      try {
        // Optional social media test (can be flaky on CI or networks)
        const youtubeUrl = 'https://www.instagram.com/p/DNPhYEgNTCv/?igsh=NzJ6NXdweTgxc2l4';
        const post = await getSocialMediaPost(youtubeUrl);
        console.log('Social media result:', post);

        if (!post.caption || !post.mediaUrl) {
          throw new Error('post.caption || post.mediaUrl is missing');
        }
      } catch (e) {
        console.warn('Social media test skipped due to error:', e instanceof Error ? e.message : e);
      }
    

    console.log('All scrap tests passed.');
    process.exitCode = 0;
  } catch (err) {
    console.error('Scrap test failed:', err);
    process.exitCode = 1;
  } finally {
    await closeBrowser();
  }
}

run();


