import axios from 'axios';
import { ANILIST_URL } from '../constants/api-constants.js';

export class AniList {
  constructor() {
    this.baseUrl = ANILIST_URL;
  }

  async getAnimeInfo(id) {
    try {
      const query = `
        query ($id: Int) {
          Media(id: $id, type: ANIME) {
            id
            title {
              romaji
              english
              native
              userPreferred
            }
            description
            coverImage {
              large
              medium
            }
            bannerImage
            episodes
            status
            season
            seasonYear
            startDate {
              year
              month
              day
            }
            endDate {
              year
              month
              day
            }
            genres
            source
            averageScore
            synonyms
            isAdult
            format
            type
          }
        }
      `;

      const response = await axios.post(this.baseUrl, {
        query,
        variables: { id }
      });

      return response.data.data.Media;
    } catch (error) {
      console.error('Error fetching anime info from AniList:', error.message);
      throw new Error('Failed to fetch anime info from AniList');
    }
  }

  async searchAnime(query) {
    try {
      const gqlQuery = `
        query ($search: String) {
          Page(page: 1, perPage: 10) {
            media(search: $search, type: ANIME) {
              id
              title {
                romaji
                english
                native
              }
              description
              coverImage {
                large
                medium
              }
              episodes
              status
              genres
              averageScore
            }
          }
        }
      `;

      const response = await axios.post(this.baseUrl, {
        query: gqlQuery,
        variables: { search: query }
      });

      return response.data.data.Page.media;
    } catch (error) {
      console.error('Error searching anime on AniList:', error.message);
      throw new Error('Failed to search anime on AniList');
    }
  }
}

export default AniList; 