import { Hono } from 'hono';
export const forms = new Hono();
forms.post('/example-submit', async (c) => {
    const { message } = await c.req.json();
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    return c.json({
        showToast: trimmedMessage
            ? `Form says: ${trimmedMessage}`
            : 'Form submitted with no message',
    }, 200);
});
//# sourceMappingURL=forms.js.map