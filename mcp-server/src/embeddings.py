"""
Word embeddings module using Google Generative AI Embeddings API
"""

import google.generativeai as genai
from typing import List, Dict
import os

# Initialize Gemini API
GEMINI_API_KEY = os.getenv("GOOGLE_AI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


def get_text_embedding(text: str) -> List[float]:
    """
    Get embedding for a given text using Google Generative AI
    """
    try:
        result = genai.embed_content(
            model="models/text-embedding-004",
            content=text,
        )
        return result["embedding"]
    except Exception as e:
        print(f"Error getting embedding for '{text}': {e}")
        raise


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """
    Calculate cosine similarity between two vectors
    """
    import math

    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    magnitude1 = math.sqrt(sum(a * a for a in vec1))
    magnitude2 = math.sqrt(sum(b * b for b in vec2))

    if magnitude1 == 0 or magnitude2 == 0:
        return 0.0

    return dot_product / (magnitude1 * magnitude2)


class WordEmbeddingStore:
    """
    Store embeddings for user words and search similar words
    """

    def __init__(self):
        self.embeddings: Dict[str, List[float]] = {}
        self.words: Dict[str, Dict] = {}

    def add_word(self, word: str, meaning: str, status: str = "new"):
        """
        Add a word and its embedding
        """
        try:
            embedding = get_text_embedding(word)
            self.embeddings[word] = embedding
            self.words[word] = {
                "meaning": meaning,
                "status": status
            }
        except Exception as e:
            print(f"Failed to add word '{word}': {e}")

    def add_words_batch(self, words_list: List[Dict]):
        """
        Add multiple words at once
        words_list: [{"english": "go", "japanese": "行く", "status": "mastered"}, ...]
        """
        for word_data in words_list:
            self.add_word(
                word=word_data["english"],
                meaning=word_data["japanese"],
                status=word_data.get("status", "new")
            )

    def search_similar_words(self, target_text: str, limit: int = 5) -> List[Dict]:
        """
        Find similar words based on embedding similarity
        Returns list of similar words with similarity scores
        """
        if not self.embeddings:
            return []

        try:
            target_embedding = get_text_embedding(target_text)

            # Calculate similarity for all words
            similarities = []
            for word, embedding in self.embeddings.items():
                similarity = cosine_similarity(target_embedding, embedding)
                similarities.append({
                    "word": word,
                    "meaning": self.words[word]["meaning"],
                    "status": self.words[word]["status"],
                    "similarity": similarity
                })

            # Sort by similarity (descending) and return top N
            similarities.sort(key=lambda x: x["similarity"], reverse=True)
            return similarities[:limit]

        except Exception as e:
            print(f"Error searching similar words: {e}")
            return []

    def get_all_words(self) -> List[Dict]:
        """
        Get all words in the store
        """
        return [
            {
                "word": word,
                "meaning": data["meaning"],
                "status": data["status"]
            }
            for word, data in self.words.items()
        ]

    def clear(self):
        """
        Clear all embeddings and words
        """
        self.embeddings.clear()
        self.words.clear()
