"""
HTTP Server for ScanVocab Quiz Context
Provides vector search and user context tools for LLM integration
"""

import json
import os
from flask import Flask, request, jsonify
from embeddings import WordEmbeddingStore

# Initialize Flask app
app = Flask(__name__)

# Global word store
word_store = WordEmbeddingStore()


@app.route('/tools/load_user_words', methods=['POST'])
def load_user_words():
    """Load user's words into the embedding store"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        words = data.get('words', [])

        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400

        # Clear previous words and load new ones
        word_store.clear()
        word_store.add_words_batch(words)

        return jsonify({
            'success': True,
            'message': f'Loaded {len(words)} words for user {user_id}'
        })

    except Exception as e:
        print(f"Error in load_user_words: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/tools/search_related_words', methods=['POST'])
def search_related_words():
    """Search for related words in user's vocabulary"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        text = data.get('text')
        limit = data.get('limit', 3)

        if not user_id or not text:
            return jsonify({'error': 'user_id and text are required'}), 400

        similar_words = word_store.search_similar_words(text, limit=limit)

        if not similar_words:
            return jsonify({
                'related_words': [],
                'message': 'No similar words found'
            })

        # Format results
        result = {
            'related_words': [
                {
                    'english': item['word'],
                    'japanese': item['meaning'],
                    'status': item['status'],
                    'similarity': round(item['similarity'], 3)
                }
                for item in similar_words
            ]
        }

        return jsonify(result)

    except Exception as e:
        print(f"Error in search_related_words: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/tools/get_user_word_list', methods=['POST'])
def get_user_word_list():
    """Get user's word list"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')

        if not user_id:
            return jsonify({'error': 'user_id is required'}), 400

        all_words = word_store.get_all_words()

        result = {
            'user_id': user_id,
            'total_words': len(all_words),
            'words': all_words
        }

        return jsonify(result)

    except Exception as e:
        print(f"Error in get_user_word_list: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok'})


def main():
    """Main entry point"""
    port = int(os.getenv('MCP_SERVER_PORT', '5000'))
    print(f"ScanVocab MCP Server starting on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)


if __name__ == '__main__':
    main()
