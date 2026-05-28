import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';
export const menu = new Hono();
menu.post('/post-create', async (c) => {
    try {
        const post = await createPost();
        return c.json({
            navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
        }, 200);
    }
    catch (error) {
        console.error(`Error creating post: ${error}`);
        return c.json({
            showToast: 'Failed to create post',
        }, 400);
    }
});
//# sourceMappingURL=menu.js.map