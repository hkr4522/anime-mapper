import { ANIME } from '@consumet/extensions';

/**
 * AnimeKai provider class that wraps the Consumet library
 */
export class AnimeKai {
  constructor() {
    this.client = new ANIME.AnimeKai();
  }

  /**
   * Search for anime on AnimeKai
   * @param {string} query - The search query
   * @returns {Promise<Object>} Search results
   */
  async search(query) {
    try {
      const results = await this.client.search(query);
      return results;
    } catch (error) {
      console.error('Error searching AnimeKai:', error);
      throw new Error('Failed to search AnimeKai');
    }
  }

  /**
   * Fetch anime information including episodes
   * @param {string} id - The anime ID
   * @returns {Promise<Object>} Anime info with episodes
   */
  async fetchAnimeInfo(id) {
    try {
      const info = await this.client.fetchAnimeInfo(id);
      return info;
    } catch (error) {
      console.error('Error fetching anime info from AnimeKai:', error);
      throw new Error('Failed to fetch anime info from AnimeKai');
    }
  }

  /**
   * Fetch episode streaming sources
   * @param {string} episodeId - The episode ID
   * @param {string} server - Optional streaming server
   * @param {boolean} dub - Whether to fetch dubbed sources (true) or subbed (false)
   * @returns {Promise<Object>} Streaming sources
   */
  async fetchEpisodeSources(episodeId, server = undefined, dub = false) {
    try {
      // Use the SubOrSub enum from Consumet if dub is true
      const subOrDub = dub ? 'dub' : 'sub';
      const sources = await this.client.fetchEpisodeSources(episodeId, server, subOrDub);
      return sources;
    } catch (error) {
      console.error('Error fetching episode sources from AnimeKai:', error);
      throw new Error('Failed to fetch episode sources from AnimeKai');
    }
  }
}

export default AnimeKai; 