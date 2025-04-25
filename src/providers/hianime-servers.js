import { load } from 'cheerio';
import { client } from '../utils/client.js';
import { HIANIME_URL } from '../constants/api-constants.js';

/**
 * Get all available servers for a HiAnime episode
 * @param {string} episodeId - Episode ID in format "anime-title-123?ep=456"
 * @returns {Promise<Object>} Object containing sub, dub, and raw server lists
 */
export async function getEpisodeServers(episodeId) {
  const result = {
    sub: [],
    dub: [],
    raw: [],
    episodeId,
    episodeNo: 0,
  };

  try {
    if (!episodeId || episodeId.trim() === "" || episodeId.indexOf("?ep=") === -1) {
      throw new Error("Invalid anime episode ID");
    }

    const epId = episodeId.split("?ep=")[1];
    const ajaxUrl = `${HIANIME_URL}/ajax/v2/episode/servers?episodeId=${epId}`;
    
    const { data } = await client.get(ajaxUrl, {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "Referer": `${HIANIME_URL}/watch/${episodeId}`
      }
    });

    if (!data.html) {
      throw new Error("No server data found");
    }

    const $ = load(data.html);

    // Extract episode number
    const epNoSelector = ".server-notice strong";
    result.episodeNo = Number($(epNoSelector).text().split(" ").pop()) || 0;

    // Extract SUB servers
    $(`.ps_-block.ps_-block-sub.servers-sub .ps__-list .server-item`).each((_, el) => {
      result.sub.push({
        serverName: $(el).find("a").text().toLowerCase().trim(),
        serverId: Number($(el)?.attr("data-server-id")?.trim()) || null,
      });
    });

    // Extract DUB servers
    $(`.ps_-block.ps_-block-sub.servers-dub .ps__-list .server-item`).each((_, el) => {
      result.dub.push({
        serverName: $(el).find("a").text().toLowerCase().trim(),
        serverId: Number($(el)?.attr("data-server-id")?.trim()) || null,
      });
    });

    // Extract RAW servers
    $(`.ps_-block.ps_-block-sub.servers-raw .ps__-list .server-item`).each((_, el) => {
      result.raw.push({
        serverName: $(el).find("a").text().toLowerCase().trim(),
        serverId: Number($(el)?.attr("data-server-id")?.trim()) || null,
      });
    });

    return result;
  } catch (error) {
    console.error('Error fetching episode servers:', error.message);
    throw error;
  }
}

/**
 * Get streaming sources for a HiAnime episode
 * @param {string} episodeId - Episode ID in format "anime-title-123?ep=456"
 * @param {string} serverName - Name of the server to get sources from
 * @param {string} category - Type of episode: 'sub', 'dub', or 'raw'
 * @returns {Promise<Object>} Object containing sources and related metadata
 */
export async function getEpisodeSources(episodeId, serverName = 'vidstreaming', category = 'sub') {
  try {
    if (!episodeId || episodeId.trim() === "" || episodeId.indexOf("?ep=") === -1) {
      throw new Error("Invalid anime episode ID");
    }

    // First get available servers
    const servers = await getEpisodeServers(episodeId);
    
    // Find the requested server
    const serverList = servers[category] || [];
    const server = serverList.find(s => s.serverName.toLowerCase() === serverName.toLowerCase());
    
    if (!server) {
      throw new Error(`Server '${serverName}' not found for category '${category}'`);
    }

    const epId = episodeId.split("?ep=")[1];
    const serverId = server.serverId;
    
    // Fetch the source URL
    const { data } = await client.get(
      `${HIANIME_URL}/ajax/v2/episode/sources?id=${epId}&server=${serverId}`,
      {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "Referer": `${HIANIME_URL}/watch/${episodeId}`
        }
      }
    );

    // Return sources format similar to the AniWatch package
    return {
      headers: {
        Referer: data.link,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36"
      },
      sources: [
        {
          url: data.link,
          isM3U8: data.link.includes('.m3u8'),
        }
      ],
      subtitles: [],
    };
  } catch (error) {
    console.error('Error fetching episode sources:', error.message);
    throw error;
  }
}

export default {
  getEpisodeServers,
  getEpisodeSources
};