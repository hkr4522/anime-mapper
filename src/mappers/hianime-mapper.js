import { getEpisodesForAnime } from '../providers/hianime.js';

/**
 * Maps an Anilist anime to HiAnime episodes
 * @param {string|number} anilistId - The AniList ID to map
 * @returns {Promise<Object>} The mapping result with episodes
 */
export async function mapAnilistToHiAnime(anilistId) {
  try {
    const episodes = await getEpisodesForAnime(anilistId);
    return episodes;
  } catch (error) {
    console.error('Error mapping Anilist to HiAnime:', error);
    throw error;
  }
}

export default mapAnilistToHiAnime; 