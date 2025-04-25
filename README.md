# Anilist to Anime Mapper API

A specialized Node.js API that maps anime data between Anilist and streaming platforms (AnimePahe, HiAnime, AnimeKai) using advanced string similarity algorithms.

## Features

- Map Anilist anime IDs to AnimePahe, HiAnime, and AnimeKai content
- Advanced string similarity analysis with multiple algorithms
- Season/year matching for multi-season anime series
- Title variation detection across platforms
- Get streaming links with proper headers
- Support for both subbed and dubbed anime (AnimeKai)

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/anilist-animepahe-mapper.git
cd anime-mapper

# Install dependencies
npm install

# Start the server
npm start
```

## API Endpoints

### AnimePahe Endpoints

#### Map Anilist ID to AnimePahe

```
GET /animepahe/map/:anilistId
```

Maps an Anilist anime ID to its corresponding AnimePahe content.

#### Get AnimePahe Streaming Links

```
GET /animepahe/sources/:session/:episodeId
```

Returns streaming links for a specific AnimePahe episode.

Alternative format:
```
GET /animepahe/sources/:id
```

### HiAnime Endpoints

#### Map Anilist ID to HiAnime

```
GET /hianime/:anilistId
```

Maps an Anilist anime ID to its corresponding HiAnime content.

#### Get HiAnime Servers

```
GET /hianime/servers/:episodeId
```

Get available servers for a HiAnime episode.

Parameters:
- `ep` (optional): Episode number

Example:
```
GET /hianime/servers/one-piece-100?ep=2142
```

#### Get HiAnime Streaming Sources

```
GET /hianime/sources/:episodeId
```

Returns streaming links for a specific HiAnime episode.

Parameters:
- `ep` (required): Episode number
- `server` (optional): Server name (default: vidstreaming)
- `category` (optional): Content type (sub, dub, raw) (default: sub)

Example:
```
GET /hianime/sources/one-piece-100?ep=2142&server=vidstreaming&category=sub
```

### AnimeKai Endpoints

#### Map Anilist ID to AnimeKai

```
GET /animekai/map/:anilistId
```

Maps an Anilist anime ID to its corresponding AnimeKai content.

#### Get AnimeKai Streaming Links

```
GET /animekai/sources/:episodeId
```

Returns streaming links for a specific AnimeKai episode.

Parameters:
- `server` (optional): Specify a streaming server
- `dub` (optional): Set to `true` or `1` to get dubbed sources instead of subbed

Example:
```
GET /animekai/sources/episode-id-here?dub=true
```

## Handling 403 Errors

When accessing the streaming URLs (not the API endpoint), you will encounter 403 Forbidden errors unless you include the proper Referer header. This is a requirement from the underlying streaming provider.

### Required Headers for Streaming

```
Referer: https://kwik.cx/
```

### Example Implementation

```javascript
// Javascript fetch example
fetch('https://streaming-url-from-response.m3u8', {
  headers: {
    'Referer': 'https://kwik.cx/'
  }
})

// Using axios
axios.get('https://streaming-url-from-response.m3u8', {
  headers: {
    'Referer': 'https://kwik.cx/'
  }
})
```

### Video Player Examples

```javascript
// Video.js player
const player = videojs('my-player', {
  html5: {
    hls: {
      overrideNative: true,
      xhr: {
        beforeRequest: function(options) {
          options.headers = {
            ...options.headers,
            'Referer': 'https://kwik.cx/'
          };
          return options;
        }
      }
    }
  }
});

// HLS.js player
const hls = new Hls({
  xhrSetup: function(xhr, url) {
    xhr.setRequestHeader('Referer', 'https://kwik.cx/');
  }
});
hls.loadSource('https://streaming-url-from-response.m3u8');
hls.attachMedia(document.getElementById('video'));
```

## Mapping Approach

The API uses several techniques to find the best match between Anilist and streaming platforms:

1. Tries multiple possible titles (romaji, english, native, userPreferred, synonyms)
2. Uses multiple string similarity algorithms to find the best match
3. Ranks matches based on similarity score 
4. Uses year and season information to match the correct season of a series
5. Extracts season numbers from titles for better matching

## Response Format Examples

### AnimePahe Mapping Response

```json
{
  "id": 131681,
  "animepahe": {
    "id": "5646-Re:ZERO -Starting Life in Another World- Season 3",
    "title": "Re:ZERO -Starting Life in Another World- Season 3",
    "type": "TV",
    "status": "Finished Airing",
    "season": "Fall",
    "year": 2024,
    "score": 8.5,
    "posterImage": "https://i.animepahe.ru/posters/016b3cda2c47fb5167e238a3f4e97f03e0d1bd3d5e8ffb079ad6d8665fb92455.jpg",
    "episodes": {
      "count": 16,
      "data": [...]
    }
  }
}
```

### AnimeKai Mapping Response

```json
{
  "id": 131681,
  "animekai": {
    "id": "re-zero-starting-life-in-another-world-season-3",
    "title": "Re:ZERO -Starting Life in Another World- Season 3",
    "malId": 51194,
    "posterImage": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx131681-OFQfZ5v67VYq.jpg",
    "episodes": [...]
  }
}
```

### Episode Sources Response

```json
{
  "headers": { "Referer": "https://kwik.cx/" },
  "sources": [
    {
      "url": "https://na-191.files.nextcdn.org/hls/01/b49063a1225cf4350deb46d79b42a7572e323274d1c9d63f3b067cc4df09986a/uwu.m3u8",
      "isM3U8": true,
      "quality": "360",
      "size": 44617958
    },
    {
      "url": "https://na-191.files.nextcdn.org/hls/01/c32da1b1975a5106dcee7e7182219f9b4dbef836fb782d7939003a8cde8f057f/uwu.m3u8",
      "isM3U8": true,
      "quality": "720",
      "size": 78630133
    },
    {
      "url": "https://na-191.files.nextcdn.org/hls/01/b85d4450908232aa32b71bc67c80e8aedcc4f32a282e5df9ad82e4662786e9d8/uwu.m3u8",
      "isM3U8": true,
      "quality": "1080",
      "size": 118025148
    }
  ]
}
```

## Notes

- This API is for educational purposes only
- Respect the terms of service of all providers (Anilist, AnimePahe, HiAnime, AnimeKai)
- Optimized for simplicity and focused exclusively on mapping functionality

## Dependencies

- Express.js - Web framework
- @consumet/extensions - For AnimePahe integration
- AniWatch (HiAnime) - For HiAnime integration
- Node-cache - For response caching

## Example Usage

Map by Anilist ID:
```
GET /animepahe/map/21
GET /hianime/21
GET /animekai/map/21
```

Get streaming links for an episode:
```
GET /animepahe/sources/session-id/episode-id
GET /animekai/sources/episode-id
GET /animekai/sources/episode-id?dub=true
``` 
