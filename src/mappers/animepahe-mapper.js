import { AniList } from '../providers/anilist.js';
import { AnimePahe } from '../providers/animepahe.js';

/**
 * Maps an Anilist anime to AnimePahe content
 */
export async function mapAnilistToAnimePahe(anilistId) {
  const mapper = new AnimepaheMapper();
  return await mapper.mapAnilistToAnimePahe(anilistId);
}

/**
 * Mapper class that provides mapping between Anilist and AnimePahe
 */
export class AnimepaheMapper {
  constructor() {
    this.anilist = new AniList();
    this.animePahe = new AnimePahe();
  }

  /**
   * Maps an Anilist anime to AnimePahe content
   */
  async mapAnilistToAnimePahe(anilistId) {
    try {
      // Get anime info from AniList
      const animeInfo = await this.anilist.getAnimeInfo(parseInt(anilistId));
      
      if (!animeInfo) {
        throw new Error(`Anime with id ${anilistId} not found on AniList`);
      }
      
      // Try to find matching content on AnimePahe
      const bestMatch = await this.findAnimePaheMatch(animeInfo);
      
      if (!bestMatch) {
        return {
          id: animeInfo.id,
          animepahe: null
        };
      }
      
      // Get episode data for the matched anime
      const episodeData = await this.getAnimePaheEpisodes(bestMatch);
      
      // Return the mapped result
      return {
        id: animeInfo.id,
        animepahe: {
          id: bestMatch.id,
          title: bestMatch.title || bestMatch.name,
          episodes: episodeData.episodes,
          type: bestMatch.type,
          status: bestMatch.status,
          season: bestMatch.season,
          year: bestMatch.year,
          score: bestMatch.score,
          posterImage: bestMatch.poster,
          session: bestMatch.session
        }
      };
    } catch (error) {
      console.error('Error mapping AniList to AnimePahe:', error.message);
      throw new Error('Failed to map AniList to AnimePahe: ' + error.message);
    }
  }

  /**
   * Finds the matching AnimePahe content for an AniList anime
   */
  async findAnimePaheMatch(animeInfo) {
    // Only use one primary title to reduce API calls
    let bestTitle = animeInfo.title.romaji || animeInfo.title.english || animeInfo.title.userPreferred;
    const titleType = animeInfo.title.romaji ? 'romaji' : (animeInfo.title.english ? 'english' : 'userPreferred');
    
    // First search attempt
    const searchResults = await this.animePahe.scrapeSearchResults(bestTitle);
    
    // Process results if we found any
    if (searchResults && searchResults.length > 0) {
      // First try direct ID match (fastest path)
      const rawId = animeInfo.id.toString();
      for (const result of searchResults) {
        const resultId = (result.id || '').split('-')[0];
        if (resultId && resultId === rawId) {
          return result;
        }
      }
      
      // If no direct ID match, find the best match with our algorithm
      return this.findBestMatchFromResults(animeInfo, searchResults);
    }
    
    // If no results found, try a fallback search with a more generic title
    const genericTitle = this.getGenericTitle(animeInfo);
    
    if (genericTitle && genericTitle !== bestTitle) {
      const fallbackResults = await this.animePahe.scrapeSearchResults(genericTitle);
      
      if (fallbackResults && fallbackResults.length > 0) {
        return this.findBestMatchFromResults(animeInfo, fallbackResults);
      }
    }
    
    return null;
  }
  
  /**
   * Find the best match from available search results
   */
  findBestMatchFromResults(animeInfo, results) {
    if (!results || results.length === 0) return null;
    
    // Normalize titles just once to avoid repeating work
    const normalizeTitle = t => t.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    const anilistTitles = [
      animeInfo.title.romaji, 
      animeInfo.title.english, 
      animeInfo.title.userPreferred
    ].filter(Boolean).map(normalizeTitle);
    
    // Prepare year information
    const anilistYear = 
      (animeInfo.startDate && animeInfo.startDate.year) ? 
      animeInfo.startDate.year : animeInfo.seasonYear;
    
    const animeYear = anilistYear || this.extractYearFromTitle(animeInfo);
    
    // Process matches sequentially with early returns
    let bestMatch = null;
    
    // Try exact title match with year (highest priority)
    if (animeYear) {
      // Find matches with exact year
      const yearMatches = [];
      for (const result of results) {
        const resultYear = result.year ? parseInt(result.year) : this.extractYearFromTitle(result);
        if (resultYear === animeYear) {
          yearMatches.push(result);
        }
      }
        
      // If we have year matches, try to find the best title match among them
      if (yearMatches.length > 0) {
        for (const match of yearMatches) {
          const resultTitle = normalizeTitle(match.title || match.name);
        
          // First try: exact title match with year
          for (const title of anilistTitles) {
            if (!title) continue;
            
            if (resultTitle === title || 
                (resultTitle.includes(title) && title.length > 7) || 
                (title.includes(resultTitle) && resultTitle.length > 7)) {
              return match; // Early return for best match
            }
          }
          
          // Second try: high similarity title match with year
          for (const title of anilistTitles) {
            if (!title) continue;
            
            const similarity = this.calculateTitleSimilarity(title, resultTitle);
            if (similarity > 0.5) {
              bestMatch = match;
              break;
            }
          }
          
          if (bestMatch) break;
        }
        
        // If we found a title similarity match with year, return it
        if (bestMatch) return bestMatch;
        
        // Otherwise use the first year match as a fallback
        return yearMatches[0];
      }
    }
    
    // Try exact title match
    for (const result of results) {
      const resultTitle = normalizeTitle(result.title || result.name);
      
      for (const title of anilistTitles) {
        if (!title) continue;
        
        if (resultTitle === title) {
          return result; // Early return for exact title match
        }
      }
    }
    
    // Try high similarity title match
    bestMatch = this.findBestSimilarityMatch(anilistTitles, results);
    if (bestMatch) return bestMatch;
    
    // Just use the first result as a fallback
    return results[0];
  }

  /**
   * Find the best match based on title similarity
   */
  findBestSimilarityMatch(titles, results) {
    const normalizeTitle = t => t.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    let bestMatch = null;
    let highestSimilarity = 0;
    
    for (const result of results) {
      const resultTitle = normalizeTitle(result.title || result.name);
      
      for (const title of titles) {
        if (!title) continue;
        
        const similarity = this.calculateTitleSimilarity(title, resultTitle);
        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          bestMatch = result;
        }
      }
    }
    
    // Only return if we have a reasonably good match
    return highestSimilarity > 0.6 ? bestMatch : null;
  }
  
  /**
   * Get the AnimePahe episodes for a match
   */
  async getAnimePaheEpisodes(match) {
    try {
      const episodeData = await this.animePahe.scrapeEpisodes(match.id);
      return {
        totalEpisodes: episodeData.totalEpisodes || 0,
        episodes: episodeData.episodes || []
      };
    } catch (error) {
      console.error('Error getting AnimePahe episodes:', error.message);
      return { totalEpisodes: 0, episodes: [] };
    }
  }
  
  /**
   * Calculate similarity between two titles
   */
  calculateTitleSimilarity(title1, title2) {
    if (!title1 || !title2) return 0;
    
    // Normalize both titles
    const norm1 = title1.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    const norm2 = title2.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    
    // Exact match is best
    if (norm1 === norm2) return 1;
    
    // Split into words
    const words1 = norm1.split(' ').filter(Boolean);
    const words2 = norm2.split(' ').filter(Boolean);
    
    // Count common words
    const commonCount = words1.filter(w => words2.includes(w)).length;
    
    // Weight by percentage of common words
    return commonCount * 2 / (words1.length + words2.length);
  }
  
  /**
   * Extract year from title (e.g., "JoJo's Bizarre Adventure (2012)" -> 2012)
   */
  extractYearFromTitle(item) {
    if (!item) return null;
    
    // Extract the title string based on the input type
    let titleStr = '';
    if (typeof item === 'string') {
      titleStr = item;
    } else if (typeof item === 'object') {
      // Handle both anime objects and result objects
      if (item.title) {
        if (typeof item.title === 'string') {
          titleStr = item.title;
        } else if (typeof item.title === 'object') {
          // AniList title object
          titleStr = item.title.userPreferred || item.title.english || item.title.romaji || '';
        }
      } else if (item.name) {
        titleStr = item.name;
      }
    }
    
    if (!titleStr) return null;
    
    // Look for year pattern in parentheses or brackets
    const yearMatches = titleStr.match(/[\(\[](\d{4})[\)\]]/);
    
    if (yearMatches && yearMatches[1]) {
      const year = parseInt(yearMatches[1]);
      if (!isNaN(year) && year > 1950 && year <= new Date().getFullYear()) {
        return year;
      }
    }
    
    return null;
  }
  
  /**
   * Get a generic title by removing year information and other specific identifiers
   */
  getGenericTitle(animeInfo) {
    if (!animeInfo || !animeInfo.title) return null;
    
    const title = animeInfo.title.english || animeInfo.title.romaji || animeInfo.title.userPreferred;
    if (!title) return null;
    
    // Remove year information and common specifiers
    return title.replace(/\([^)]*\d{4}[^)]*\)/g, '').replace(/\[[^\]]*\d{4}[^\]]*\]/g, '').trim();
  }
}

export default mapAnilistToAnimePahe; 