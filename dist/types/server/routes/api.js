import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
export const api = new Hono();
api.get('/init', async (c) => {
    const { postId } = context;
    if (!postId) {
        console.error('API Init Error: postId not found in devvit context');
        return c.json({
            status: 'error',
            message: 'postId is required but missing from context',
        }, 400);
    }
    try {
        const [count, username] = await Promise.all([
            redis.get('count'),
            reddit.getCurrentUsername(),
        ]);
        return c.json({
            type: 'init',
            postId: postId,
            count: count ? parseInt(count) : 0,
            username: username ?? 'anonymous',
        });
    }
    catch (error) {
        console.error(`API Init Error for post ${postId}:`, error);
        let errorMessage = 'Unknown error during initialization';
        if (error instanceof Error) {
            errorMessage = `Initialization failed: ${error.message}`;
        }
        return c.json({ status: 'error', message: errorMessage }, 400);
    }
});
api.post('/increment', async (c) => {
    const { postId } = context;
    if (!postId) {
        return c.json({
            status: 'error',
            message: 'postId is required',
        }, 400);
    }
    const count = await redis.incrBy('count', 1);
    return c.json({
        count,
        postId,
        type: 'increment',
    });
});
api.post('/decrement', async (c) => {
    const { postId } = context;
    if (!postId) {
        return c.json({
            status: 'error',
            message: 'postId is required',
        }, 400);
    }
    const count = await redis.incrBy('count', -1);
    return c.json({
        count,
        postId,
        type: 'decrement',
    });
});
//# sourceMappingURL=api.js.map