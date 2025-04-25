import { AniList } from '../providers/anilist.js';
import { AnimeKai } from '../providers/animekai.js';

/**
 * Maps an Anilist anime to AnimeKai
 * @param {string|number} anilistId - The AniList ID to map
 * @returns {Promise<Object>} The mapping result with episodes
 */
export async function mapAnilistToAnimeKai(anilistId) {
  const mapper = new AnimeKaiMapper();
  return await mapper.mapAnilistToAnimeKai(anilistId);
}

/**
 * Mapper class that provides mapping between Anilist and AnimeKai
 */
export class AnimeKaiMapper {
  constructor() {
    this.anilist = new AniList();
    this.animeKai = new AnimeKai();
  }

  /**
   * Maps an Anilist anime to AnimeKai content
   * @param {string|number} anilistId - The AniList ID to map
   */
  async mapAnilistToAnimeKai(anilistId) {
    try {
      // Get anime info from AniList
      const animeInfo = await this.anilist.getAnimeInfo(parseInt(anilistId));
      
      if (!animeInfo) {
        throw new Error(`Anime with id ${anilistId} not found on AniList`);
      }
      
      // Search for the anime on AnimeKai using the title
      const searchTitle = animeInfo.title.english || animeInfo.title.romaji || animeInfo.title.userPreferred;
      if (!searchTitle) {
        throw new Error('No title available for the anime');
      }
      
      const searchResults = await this.animeKai.search(searchTitle);
      if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
        return {
          id: animeInfo.id,
          title: searchTitle,
          animekai: null
        };
      }
      
      // Find the best match from search results
      const bestMatch = this.findBestMatch(searchTitle, animeInfo, searchResults.results);
      if (!bestMatch) {
        return {
          id: animeInfo.id,
          title: searchTitle,
          animekai: null
        };
      }
      
      // Get detailed info for the best match
      const animeDetails = await this.animeKai.fetchAnimeInfo(bestMatch.id);
      
      return {
        id: animeInfo.id,
        title: searchTitle,
        animekai: {
          id: bestMatch.id,
          title: bestMatch.title,
          japaneseTitle: bestMatch.japaneseTitle,
          url: bestMatch.url,
          image: bestMatch.image,
          type: bestMatch.type,
          episodes: animeDetails.totalEpisodes,
          episodesList: animeDetails.episodes,
          hasSub: animeDetails.hasSub,
          hasDub: animeDetails.hasDub,
          subOrDub: animeDetails.subOrDub,
          status: animeDetails.status,
          season: animeDetails.season,
          genres: animeDetails.genres
        }
      };
    } catch (error) {
      console.error('Error mapping AniList to AnimeKai:', error);
      throw error;
    }
  }
  
  /**
   * Find the best match from search results
   * @param {string} searchTitle - The search title
   * @param {Object} animeInfo - The AniList anime info
   * @param {Array} results - The search results
   * @returns {Object|null} The best match or null if no good match found
   */
  findBestMatch(searchTitle, animeInfo, results) {
    if (!results || results.length === 0) return null;
    
    // Normalize titles for comparison
    const normalizeTitle = title => title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    const normalizedSearch = normalizeTitle(searchTitle);
    
    // Extract year from AniList title if present
    let year = null;
    if (animeInfo.startDate && animeInfo.startDate.year) {
      year = animeInfo.startDate.year;
    } else if (animeInfo.seasonYear) {
      year = animeInfo.seasonYear;
    }
    
    // First try: find exact title match
    for (const result of results) {
      const resultTitle = normalizeTitle(result.title);
      const japaneseTitle = result.japaneseTitle ? normalizeTitle(result.japaneseTitle) : '';
      
      if (resultTitle === normalizedSearch || japaneseTitle === normalizedSearch) {
        return result;
      }
    }
    
    // Second try: find partial match with proper episode count match
    const expectedEpisodes = animeInfo.episodes || 0;
    for (const result of results) {
      const resultTitle = normalizeTitle(result.title);
      const japaneseTitle = result.japaneseTitle ? normalizeTitle(result.japaneseTitle) : '';
      
      // Check if this is likely the right anime by comparing episode count
      if (result.episodes === expectedEpisodes && expectedEpisodes > 0) {
        if (resultTitle.includes(normalizedSearch) || 
            normalizedSearch.includes(resultTitle) ||
            japaneseTitle.includes(normalizedSearch) ||
            normalizedSearch.includes(japaneseTitle)) {
          return result;
        }
      }
    }
    
    // Final fallback: just return the first result
    return results[0];
  }
}

export default mapAnilistToAnimeKai; 