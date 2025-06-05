import express from 'express';
import { ANIME } from '@consumet/extensions';
import { HiAnime } from 'aniwatch';
import { mapAnilistToAnimePahe, mapAnilistToHiAnime, mapAnilistToAnimeKai } from './mappers/index.js';
import { AniList } from './providers/anilist.js';
import { AnimeKai } from './providers/animekai.js';
import { getEpisodeServers } from './providers/hianime-servers.js';
import { cache } from './utils/cache.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Return server information
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Anilist to AnimePahe Mapper API',
    routes: [
      '/animepahe/map/:anilistId',
      '/animepahe/sources/:session/:episodeId',
      '/animepahe/sources/:id',
      '/hianime/:anilistId',
      '/hianime/servers/:episodeId - For example: /hianime/servers/one-piece-100?ep=2142',
      '/hianime/sources/:episodeId - optional params: ?ep=episodeId&server=serverName&category=sub|dub|raw',
      '/animekai/map/:anilistId',
      '/animekai/sources/:episodeId - supports ?server and ?dub=true params',
      '/animepahe/hls/:anilistId/:episode'
    ],
  });
});

// Map Anilist ID to AnimePahe
app.get('/animepahe/map/:anilistId', cache('5 minutes'), async (req, res) => {
  try {
    const { anilistId } = req.params;
    
    if (!anilistId) {
      return res.status(400).json({ error: 'AniList ID is required' });
    }
    
    const mappingResult = await mapAnilistToAnimePahe(anilistId);
    return res.json(mappingResult);
  } catch (error) {
    console.error('Mapping error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Map Anilist ID to HiAnime
app.get('/hianime/:anilistId', cache('5 minutes'), async (req, res) => {
  try {
    const { anilistId } = req.params;
    
    if (!anilistId) {
      return res.status(400).json({ error: 'AniList ID is required' });
    }
    
    const episodes = await mapAnilistToHiAnime(anilistId);
    return res.json(episodes);
  } catch (error) {
    console.error('HiAnime mapping error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Get available servers for HiAnime episode
app.get('/hianime/servers/:animeId', cache('15 minutes'), async (req, res) => {
  try {
    const { animeId } = req.params;
    const { ep } = req.query;
    
    if (!animeId) {
      return res.status(400).json({ error: 'Anime ID is required' });
    }
    
    // Combine animeId and ep to form the expected episodeId format
    const episodeId = ep ? `${animeId}?ep=${ep}` : animeId;
    
    const servers = await getEpisodeServers(episodeId);
    return res.json(servers);
  } catch (error) {
    console.error('HiAnime servers error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Get streaming sources for HiAnime episode using AniWatch
app.get('/hianime/sources/:animeId', cache('15 minutes'), async (req, res) => {
  try {
    const { animeId } = req.params;
    const { ep, server = 'vidstreaming', category = 'sub' } = req.query;
    
    if (!animeId || !ep) {
      return res.status(400).json({ error: 'Both anime ID and episode number (ep) are required' });
    }
    
    // Combine animeId and ep to form the expected episodeId format
    const episodeId = `${animeId}?ep=${ep}`;
    
    // Use the AniWatch library directly
    const hianime = new HiAnime.Scraper();
    const sources = await hianime.getEpisodeSources(episodeId, server, category);
    
    return res.json({
      success: true,
      data: sources
    });
  } catch (error) {
    console.error('HiAnime sources error:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Map Anilist ID to AnimeKai
app.get('/animekai/map/:anilistId', cache('5 minutes'), async (req, res) => {
  try {
    const { anilistId } = req.params;
    
    if (!anilistId) {
      return res.status(400).json({ error: 'AniList ID is required' });
    }
    
    const mappingResult = await mapAnilistToAnimeKai(anilistId);
    return res.json(mappingResult);
  } catch (error) {
    console.error('AnimeKai mapping error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Get episode sources from AnimeKai
app.get('/animekai/sources/:episodeId', cache('15 minutes'), async (req, res) => {
  try {
    const { episodeId } = req.params;
    const { server, dub } = req.query;
    
    if (!episodeId) {
      return res.status(400).json({ error: 'Episode ID is required' });
    }
    
    const animeKai = new AnimeKai();
    const isDub = dub === 'true' || dub === '1';
    const sources = await animeKai.fetchEpisodeSources(episodeId, server, isDub);
    return res.json(sources);
  } catch (error) {
    console.error('AnimeKai sources error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Get HLS streaming links for an episode using path parameter that may contain slashes
app.get('/animepahe/sources/:session/:episodeId', cache('15 minutes'), async (req, res) => {
  try {
    const { session, episodeId } = req.params;
    const fullEpisodeId = `${session}/${episodeId}`;
    
    // Initialize a new AnimePahe instance each time
    const consumetAnimePahe = new ANIME.AnimePahe();
    
    // Directly fetch and return the sources without modification
    const sources = await consumetAnimePahe.fetchEpisodeSources(fullEpisodeId);
    
    // Simply return the sources directly as provided by Consumet
    return res.status(200).json(sources);
  } catch (error) {
    console.error('Error fetching episode sources:', error.message);
    
    // Keep error handling simple
    return res.status(500).json({ 
      error: error.message,
      message: 'Failed to fetch episode sources. If you receive a 403 error when accessing streaming URLs, add a Referer: "https://kwik.cx/" header to your requests.'
    });
  }
});

// Backward compatibility for the single parameter version
app.get('/animepahe/sources/:id', cache('15 minutes'), async (req, res) => {
  try {
    const episodeId = req.params.id;
    
    if (!episodeId) {
      return res.status(400).json({ error: 'Episode ID is required' });
    }
    
    // Initialize a new AnimePahe instance each time
    const consumetAnimePahe = new ANIME.AnimePahe();
    
    // Directly fetch and return the sources without modification
    const sources = await consumetAnimePahe.fetchEpisodeSources(episodeId);
    
    // Simply return the sources directly as provided by Consumet
    return res.status(200).json(sources);
  } catch (error) {
    console.error('Error fetching episode sources:', error.message);
    
    // Keep error handling simple
    return res.status(500).json({ 
      error: error.message,
      message: 'Failed to fetch episode sources. If you receive a 403 error when accessing streaming URLs, add a Referer: "https://kwik.cx/" header to your requests.'
    });
  }
});

// Get HLS streaming links for a specific episode using Anilist ID and episode number
app.get('/animepahe/hls/:anilistId/:episode', cache('15 minutes'), async (req, res) => {
  try {
    const { anilistId, episode } = req.params;
    
    if (!anilistId || !episode) {
      return res.status(400).json({ error: 'Both AniList ID and episode number are required' });
    }
    
    // First, get the mapping from Anilist to AnimePahe
    const mappingResult = await mapAnilistToAnimePahe(anilistId);
    
    if (!mappingResult.animepahe || !mappingResult.animepahe.episodes || mappingResult.animepahe.episodes.length === 0) {
      return res.status(404).json({ error: 'No episodes found for this anime on AnimePahe' });
    }
    
    // Find the episode with the matching number
    const targetEpisode = mappingResult.animepahe.episodes.find(ep => ep.number === parseInt(episode));
    
    if (!targetEpisode) {
      return res.status(404).json({ error: `Episode ${episode} not found on AnimePahe` });
    }
    
    // Now fetch the sources for this episode
    const consumetAnimePahe = new ANIME.AnimePahe();
    const sources = await consumetAnimePahe.fetchEpisodeSources(targetEpisode.episodeId);
    
    // Return the sources directly
    return res.status(200).json({
      sources: sources,
      image: targetEpisode.image || ''
    });
  } catch (error) {
    console.error('Error fetching HLS sources:', error.message);
    return res.status(500).json({ 
      error: error.message,
      message: 'Failed to fetch HLS sources. If you receive a 403 error when accessing streaming URLs, add a Referer: "https://kwik.cx/" header to your requests.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});