export async function telegramApiCall<T>(
  token: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = (await response.json()) as { ok?: boolean; description?: string } & T;
  if (!response.ok || json.ok === false) {
    throw new Error(`Telegram ${method} failed: ${json.description ?? response.statusText}`);
  }
  return json;
}

export async function telegramSendMessage(token: string, chatId: string, text: string): Promise<void> {
  await telegramApiCall(token, 'sendMessage', {
    chat_id: chatId,
    text: text.slice(0, 4000),
    disable_web_page_preview: true,
  });
}
