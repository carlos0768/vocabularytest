/**
 * MCP Client for ScanVocab
 * Communicates with the MCP server for context-aware quiz generation
 */

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:5000';

/**
 * Call an MCP tool via HTTP
 */
export async function callMCPTool(
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  try {
    const response = await fetch(`${MCP_SERVER_URL}/tools/${toolName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      throw new Error(`MCP server error: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`MCP tool call failed: ${toolName}`, error);
    throw error;
  }
}

/**
 * Load user words into MCP embedding store
 */
export async function loadUserWords(
  userId: string,
  words: Array<{
    english: string;
    japanese: string;
    status: 'new' | 'review' | 'mastered';
  }>
): Promise<void> {
  try {
    await callMCPTool('load_user_words', {
      user_id: userId,
      words,
    });
  } catch (error) {
    console.error('Failed to load user words:', error);
    throw error;
  }
}

/**
 * Search for related words in user's vocabulary
 */
export async function searchRelatedWords(
  userId: string,
  text: string,
  limit: number = 3
): Promise<Array<{
  english: string;
  japanese: string;
  status: string;
  similarity: number;
}>> {
  try {
    const result = await callMCPTool('search_related_words', {
      user_id: userId,
      text,
      limit,
    });

    return result.related_words || [];
  } catch (error) {
    console.error('Failed to search related words:', error);
    return [];
  }
}

/**
 * Get user's word list
 */
export async function getUserWordList(
  userId: string
): Promise<Array<{
  word: string;
  meaning: string;
  status: string;
}>> {
  try {
    const result = await callMCPTool('get_user_word_list', {
      user_id: userId,
    });

    return result.words || [];
  } catch (error) {
    console.error('Failed to get user word list:', error);
    return [];
  }
}
