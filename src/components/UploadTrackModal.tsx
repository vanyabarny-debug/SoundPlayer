import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Music, Search, Plus } from 'lucide-react';
import { useMockServer, TrackFormat, Artist } from '../store/mockServer';
import { useAuthStore } from '../store/authStore';
import { saveAudioFile, saveImageFile } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';
import { CachedImage } from './CachedImage';

function CreateArtistModal({ initialName, onSave, onClose, currentUserId }: { initialName: string, onSave: (artist: Artist) => void, onClose: () => void, currentUserId: string }) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState('');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setBannerFile(file);
      setBannerPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    let bannerId = '';
    if (bannerFile) {
      bannerId = uuidv4();
      await saveImageFile(bannerId, bannerFile);
    }

    const newArtist: Artist = {
      id: uuidv4(),
      name: name.trim(),
      description: description.trim(),
      bannerUrl: bannerId || undefined,
      ownerId: currentUserId
    };
    onSave(newArtist);
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] bg-slate-900/55 flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden flex flex-col border border-slate-200">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-xl font-bold">Новый артист</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700">
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSave} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Имя артиста</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-slate-50 text-slate-700 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-200"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Описание</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-slate-50 text-slate-700 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none h-24"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Баннер артиста</label>
            <div 
              className="w-full h-32 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors relative overflow-hidden"
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
              />
              {bannerPreview ? (
                <img src={bannerPreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <>
                  <Upload className="w-6 h-6 text-slate-400 mb-2" />
                  <span className="text-xs font-medium text-slate-500">Выбрать фото</span>
                </>
              )}
            </div>
          </div>
          <div className="pt-4">
            <button type="submit" className="w-full bg-violet-600 text-white font-bold py-3 rounded-xl hover:bg-violet-700 transition-colors">
              Сохранить артиста
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export function UploadTrackModal({ onClose }: { onClose: () => void }) {
  const { addTrack, artists, addArtist, users, updateUser } = useMockServer();
  const currentUserId = useAuthStore(state => state.currentUserId);
  
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [isExplicit, setIsExplicit] = useState(false);
  const [isSingle, setIsSingle] = useState(false);
  const [producer, setProducer] = useState('');
  const [features, setFeatures] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  
  const [showArtistDropdown, setShowArtistDropdown] = useState(false);
  const [creatingArtistName, setCreatingArtistName] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const artistInputRef = useRef<HTMLDivElement>(null);

  const allArtists = Object.values(artists);
  const currentArtistSearch = artist.split(',').pop()?.trim() || '';
  const filteredArtists = allArtists.filter(a => 
    a.name.toLowerCase().includes(currentArtistSearch.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (artistInputRef.current && !artistInputRef.current.contains(event.target as Node)) {
        setShowArtistDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
  }, []);

  const handleSelectArtist = (artistName: string) => {
    const parts = artist.split(',');
    parts.pop(); // remove the current search part
    const newArtistString = parts.length > 0 ? parts.join(', ') + ', ' + artistName + ', ' : artistName + ', ';
    setArtist(newArtistString);
    setShowArtistDropdown(false);
  };

  const handleCreateArtistSave = (newArtist: Artist) => {
    addArtist(newArtist);
    if (currentUserId) {
      const user = users[currentUserId];
      if (user) {
        const favoriteArtistIds = user.favoriteArtistIds || [];
        if (!favoriteArtistIds.includes(newArtist.id)) {
          updateUser(user.id, { favoriteArtistIds: [...favoriteArtistIds, newArtist.id] });
        }
      }
    }
    handleSelectArtist(newArtist.name);
    setCreatingArtistName(null);
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      if (!title) {
        setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const getFormat = (filename: string): TrackFormat => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'mp3') return 'mp3';
    if (ext === 'wav') return 'wav';
    if (ext === 'flac') return 'flac';
    if (ext === 'mp4' || ext === 'm4a') return 'mp4';
    return 'unknown';
  };

  const getAudioDuration = async (audioFile: File): Promise<number> => {
    const objectUrl = URL.createObjectURL(audioFile);
    try {
      const duration = await new Promise<number>((resolve) => {
        const audio = document.createElement('audio');
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => {
          resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
        };
        audio.onerror = () => resolve(0);
        audio.src = objectUrl;
      });
      return duration;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !currentUserId) return;

    const trackId = uuidv4();
    
    // Save to IndexedDB
    await saveAudioFile(trackId, file);

    let coverId = '';
    if (coverFile) {
      coverId = uuidv4();
      await saveImageFile(coverId, coverFile);
    }
    
    const duration = await getAudioDuration(file);

    // Save metadata to mock server
    addTrack({
      id: trackId,
      title,
      artistIds: artist.split(',').map(a => a.trim()).filter(Boolean),
      duration,
      isExplicit,
      isSingle,
      producer,
      features: features.split(',').map(f => f.trim()).filter(Boolean),
      lyrics,
      coverUrl: coverId || undefined,
      format: getFormat(file.name),
      ownerId: currentUserId,
    });
    const user = users[currentUserId];
    if (user) {
      const favoriteTrackIds = user.favoriteTrackIds || [];
      const nextFavorites = [trackId, ...favoriteTrackIds.filter((id) => id !== trackId)];
      updateUser(user.id, { favoriteTrackIds: nextFavorites });
    }

    // Auto-create artists if they don't exist
    const artistNames = artist.split(',').map(a => a.trim()).filter(Boolean);
    const existingArtists = Object.values(useMockServer.getState().artists);
    const currentUserState = useMockServer.getState().users[currentUserId];
    const favoriteArtistIds = currentUserState?.favoriteArtistIds || [];
    const newFavoriteArtistIds = [...favoriteArtistIds];
    artistNames.forEach(name => {
      const existing = existingArtists.find(a => a.name === name);
      if (!existing) {
        const artistId = uuidv4();
        const artistBannerId = coverFile ? `artist-banner-${artistId}` : undefined;
        if (coverFile && artistBannerId) {
          void saveImageFile(artistBannerId, coverFile);
        }
        useMockServer.getState().addArtist({
          id: artistId,
          name,
          description: '',
          bannerUrl: artistBannerId,
        });
        if (!newFavoriteArtistIds.includes(artistId)) {
          newFavoriteArtistIds.push(artistId);
        }
      } else if (!newFavoriteArtistIds.includes(existing.id)) {
        newFavoriteArtistIds.push(existing.id);
      }
    });
    if (currentUserState) {
      updateUser(currentUserState.id, { favoriteArtistIds: newFavoriteArtistIds });
    }

    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-900/55 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-xl font-bold">Загрузить трек</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="overflow-y-auto p-4 flex-1">
          <form id="upload-form" onSubmit={handleSubmit} className="space-y-4">
            
            <div
              className="border-2 border-dashed border-slate-300 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-slate-400 bg-slate-50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="audio/*" 
                className="hidden" 
              />
              {file ? (
                <>
                  <Music className="w-12 h-12 text-violet-500 mb-2" />
                  <span className="text-sm font-medium text-center">{file.name}</span>
                  <span className="text-xs text-slate-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-slate-400 mb-2" />
                  <span className="text-sm font-medium text-slate-600">Выбрать аудиофайл</span>
                  <span className="text-xs text-slate-500 mt-1">MP3, WAV, FLAC, M4A</span>
                </>
              )}
            </div>

            {file && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Название трека</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="w-full bg-slate-50 text-slate-700 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    required
                  />
                </div>
                
                <div className="relative" ref={artistInputRef}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Артист (через запятую)</label>
                  <input
                    type="text"
                    value={artist}
                    onChange={e => {
                      setArtist(e.target.value);
                      setShowArtistDropdown(true);
                    }}
                    onFocus={() => setShowArtistDropdown(true)}
                    className="w-full bg-slate-50 text-slate-700 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-200"
                    required
                    autoComplete="off"
                  />
                  {showArtistDropdown && currentArtistSearch && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                      {filteredArtists.map(a => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => handleSelectArtist(a.name)}
                          className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm flex items-center gap-2"
                        >
                          <Search className="w-4 h-4 text-slate-400" />
                          {a.name}
                        </button>
                      ))}
                      {!filteredArtists.find(a => a.name.toLowerCase() === currentArtistSearch.toLowerCase()) && (
                        <button
                          type="button"
                          onClick={() => setCreatingArtistName(currentArtistSearch)}
                          className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm text-violet-600 flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          Создать артиста: <span className="font-bold text-slate-700">{currentArtistSearch}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isExplicit} 
                      onChange={e => setIsExplicit(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 bg-white text-indigo-500 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-600">Ненормативная лексика (E)</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isSingle} 
                      onChange={e => setIsSingle(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 bg-white text-indigo-500 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-slate-600">Сингл</span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Фиты (через запятую)</label>
                  <input
                    type="text"
                    value={features}
                    onChange={e => setFeatures(e.target.value)}
                    className="w-full bg-slate-50 text-slate-700 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Текст песни</label>
                  <textarea
                    value={lyrics}
                    onChange={e => setLyrics(e.target.value)}
                    rows={4}
                    className="w-full bg-slate-50 text-slate-700 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Обложка трека</label>
                  <div 
                    className="w-full h-32 bg-slate-50 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors relative overflow-hidden"
                    onClick={() => coverInputRef.current?.click()}
                  >
                    <input 
                      type="file" 
                      ref={coverInputRef} 
                      onChange={handleCoverChange} 
                      accept="image/*" 
                      className="hidden" 
                    />
                    {coverPreview ? (
                      <img src={coverPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <Upload className="w-6 h-6 text-slate-400 mb-2" />
                        <span className="text-xs font-medium text-slate-500">Выбрать фото</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>
        
        <div className="p-4 border-t border-slate-200">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
            >
              Отмена
            </button>
            <button
              type="submit"
              form="upload-form"
              disabled={!file}
              className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Загрузить
            </button>
          </div>
        </div>
      </div>
      {creatingArtistName && currentUserId && (
        <CreateArtistModal 
          initialName={creatingArtistName} 
          onSave={handleCreateArtistSave} 
          onClose={() => setCreatingArtistName(null)}
          currentUserId={currentUserId}
        />
      )}
    </div>,
    document.body
  );
}
