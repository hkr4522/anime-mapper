import axios from 'axios';
import * as cheerio from 'cheerio';

export class AnimePahe {
  constructor() {
    this.baseUrl = "https://animepahe.si";
    this.sourceName = 'AnimePahe';
    this.isMulti = false;
  }

  async scrapeSearchResults(query) {
    try {
      const response = await axios.get(`${this.baseUrl}/api?m=search&l=8&q=${query}`, {
        headers: {
          'Cookie': "__ddg1_=;__ddg2_=;",
        }
      });
      
      const jsonResult = response.data;
      const searchResults = [];

      if (!jsonResult.data || !jsonResult.data.length) {
        return searchResults;
      }

      for (const item of jsonResult.data) {
        searchResults.push({
          id: `${item.id}-${item.title}`,
          title: item.title,
          name: item.title,
          type: item.type || 'TV',
          episodes: item.episodes || 0,
          status: item.status || 'Unknown',
          season: item.season || 'Unknown',
          year: item.year || 0,
          score: item.score || 0,
          poster: item.poster,
          session: item.session,
          episodes: { 
            sub: item.episodes || null, 
            dub: '??' 
          }
        });
      }

      return searchResults;
    } catch (error) {
      console.error('Error searching AnimePahe:', error.message);
      throw new Error('Failed to search AnimePahe');
    }
  }

  async scrapeEpisodes(url) {
    try {
      const title = url.split('-')[1];
      const id = url.split('-')[0];
      
      const session = await this._getSession(title, id);
      const epUrl = `${this.baseUrl}/api?m=release&id=${session}&sort=episode_desc&page=1`;
      
      const response = await axios.get(epUrl, {
        headers: {
          'Cookie': "__ddg1_=;__ddg2_=;",
        }
      });
      
      return await this._recursiveFetchEpisodes(epUrl, JSON.stringify(response.data), session);
    } catch (error) {
      console.error('Error fetching episodes:', error.message);
      throw new Error('Failed to fetch episodes');
    }
  }

  async _recursiveFetchEpisodes(url, responseData, session) {
    try {
      const jsonResult = JSON.parse(responseData);
      const page = jsonResult.current_page;
      const hasNextPage = page < jsonResult.last_page;
      let animeTitle = 'Could not fetch title';
      let episodes = [];
      let animeDetails = {
        type: 'TV',
        status: 'Unknown',
        season: 'Unknown',
        year: 0,
        score: 0
      };

      for (const item of jsonResult.data) {
        episodes.push({
          title: `Episode ${item.episode}`,
          episodeId: `${session}/${item.session}`,
          number: item.episode,
          image: item.snapshot,
        });
      }

      if (hasNextPage) {
        const newUrl = `${url.split("&page=")[0]}&page=${page + 1}`;
        const newResponse = await axios.get(newUrl, {
          headers: {
            'Cookie': "__ddg1_=;__ddg2_=;",
          }
        });
        
        const moreEpisodes = await this._recursiveFetchEpisodes(newUrl, JSON.stringify(newResponse.data), session);
        episodes = [...episodes, ...moreEpisodes.episodes];
        animeTitle = moreEpisodes.title;
        animeDetails = moreEpisodes.details || animeDetails;
      } else {
        const detailUrl = `https://animepahe.ru/a/${jsonResult.data[0].anime_id}`;
        const newResponse = await axios.get(detailUrl, {
          headers: {
            'Cookie': "__ddg1_=;__ddg2_=;",
          }
        });
        
        if (newResponse.status === 200) {
          const $ = cheerio.load(newResponse.data);
          animeTitle = $('.title-wrapper span').text().trim() || 'Could not fetch title';
          
          // Try to extract additional information
          try {
            // Parse type
            const typeText = $('.col-sm-4.anime-info p:contains("Type")').text();
            if (typeText) {
              animeDetails.type = typeText.replace('Type:', '').trim();
            }
            
            // Parse status
            const statusText = $('.col-sm-4.anime-info p:contains("Status")').text();
            if (statusText) {
              animeDetails.status = statusText.replace('Status:', '').trim();
            }
            
            // Parse season and year
            const seasonText = $('.col-sm-4.anime-info p:contains("Season")').text();
            if (seasonText) {
              const seasonMatch = seasonText.match(/Season:\s+(\w+)\s+(\d{4})/);
              if (seasonMatch) {
                animeDetails.season = seasonMatch[1];
                animeDetails.year = parseInt(seasonMatch[2]);
              }
            }
            
            // Parse score
            const scoreText = $('.col-sm-4.anime-info p:contains("Score")').text();
            if (scoreText) {
              const scoreMatch = scoreText.match(/Score:\s+([\d.]+)/);
              if (scoreMatch) {
                animeDetails.score = parseFloat(scoreMatch[1]);
              }
            }
          } catch (err) {
            console.error('Error parsing anime details:', err.message);
          }
        }
      }

      // Always sort episodes by number in ascending order, regardless of how the API returns them
      const sortedEpisodes = [...episodes].sort((a, b) => a.number - b.number);

      return {
        title: animeTitle,
        session: session,
        totalEpisodes: jsonResult.total,
        details: animeDetails,
        episodes: sortedEpisodes, // Return sorted episodes, always in ascending order
      };
    } catch (error) {
      console.error('Error recursively fetching episodes:', error.message);
      throw new Error('Failed to fetch episodes recursively');
    }
  }

  async scrapeEpisodesSrcs(episodeUrl, { category, lang } = {}) {
    try {
      const response = await axios.get(`${this.baseUrl}/play/${episodeUrl}`, {
        headers: {
          'Cookie': "__ddg1_=;__ddg2_=;",
        }
      });
      
      const $ = cheerio.load(response.data);
      const buttons = $('#resolutionMenu > button');
      const videoLinks = [];

      for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        const kwikLink = $(btn).attr('data-src');
        const quality = $(btn).text();
        
        // Instead of extracting, just return the link directly
        videoLinks.push({
          quality: quality,
          url: kwikLink,
          referer: "https://kwik.cx",
        });
      }

      const result = {
        sources: videoLinks.length > 0 ? [{ url: videoLinks[0].url }] : [],
        multiSrc: videoLinks,
      };
      
      return result;
    } catch (error) {
      console.error('Error fetching episode sources:', error.message);
      throw new Error('Failed to fetch episode sources');
    }
  }

  async _getSession(title, animeId) {
    try {
      const response = await axios.get(`${this.baseUrl}/api?m=search&q=${title}`, {
        headers: {
          'Cookie': "__ddg1_=;__ddg2_=;",
        }
      });
      
      const resBody = response.data;
      if (!resBody.data || resBody.data.length === 0) {
        throw new Error(`No results found for title: ${title}`);
      }
      
      // First try: Direct ID match if provided and valid
      if (animeId) {
        const animeIdMatch = resBody.data.find(anime => String(anime.id) === String(animeId));
        if (animeIdMatch) {
          return animeIdMatch.session;
        }
      }
      
      // Second try: Normalize titles and find best match
      const normalizeTitle = t => t.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
      const normalizedSearchTitle = normalizeTitle(title);
      
      let bestMatch = null;
      let highestSimilarity = 0;
      
      for (const anime of resBody.data) {
        const normalizedAnimeTitle = normalizeTitle(anime.title);
        // Calculate simple similarity (more sophisticated than exact match)
        let similarity = 0;
        
        // Exact match
        if (normalizedAnimeTitle === normalizedSearchTitle) {
          similarity = 1;
        } 
        // Contains match
        else if (normalizedAnimeTitle.includes(normalizedSearchTitle) || 
                normalizedSearchTitle.includes(normalizedAnimeTitle)) {
          const lengthRatio = Math.min(normalizedAnimeTitle.length, normalizedSearchTitle.length) / 
                             Math.max(normalizedAnimeTitle.length, normalizedSearchTitle.length);
          similarity = 0.8 * lengthRatio;
        }
        // Word match
        else {
          const searchWords = normalizedSearchTitle.split(' ');
          const animeWords = normalizedAnimeTitle.split(' ');
          const commonWords = searchWords.filter(word => animeWords.includes(word));
          similarity = commonWords.length / Math.max(searchWords.length, animeWords.length);
        }
        
        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          bestMatch = anime;
        }
      }
      
      if (bestMatch && highestSimilarity > 0.5) {
        return bestMatch.session;
      }
      
      // Default to first result if no good match found
      return resBody.data[0].session;
    } catch (error) {
      console.error('Error getting session:', error.message);
      throw new Error('Failed to get session');
    }
  }
}

export default AnimePahe; 
