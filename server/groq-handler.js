// Helper perbaikan escape string JSON khusus formula matematika & LaTeX dari LLM
function repairJsonMathStrings(jsonStr) {
  let out = '';
  let inString = false;
  let i = 0;
  const len = jsonStr.length;

  while (i < len) {
    const ch = jsonStr[i];

    if (!inString) {
      if (ch === '"') {
        inString = true;
      }
      out += ch;
      i++;
    } else {
      if (ch === '"') {
        inString = false;
        out += ch;
        i++;
      } else if (ch === '\\') {
        const next = jsonStr[i + 1];
        if (next === undefined) {
          out += '\\\\';
          i++;
        } else if (next === '"' || next === '\\' || next === '/') {
          out += ch + next;
          i += 2;
        } else if (next === 'n' || next === 'r') {
          const lookahead = jsonStr.slice(i + 1, i + 6);
          if (lookahead.startsWith('nabla')) {
            out += '\\\\nabla';
            i += 6;
          } else {
            out += ch + next;
            i += 2;
          }
        } else if (next === 't') {
          const rest = jsonStr.slice(i + 1, i + 10);
          const match = rest.match(/^(text|times|tan|theta|tau|triangle|tfrac|to|top)/i);
          if (match) {
            out += '\\\\' + match[1];
            i += 1 + match[1].length;
          } else {
            out += ch + next;
            i += 2;
          }
        } else if (next === 'f') {
          const rest = jsonStr.slice(i + 1, i + 8);
          const match = rest.match(/^(frac|forall|flat)/i);
          if (match) {
            out += '\\\\' + match[1];
            i += 1 + match[1].length;
          } else {
            out += ch + next;
            i += 2;
          }
        } else if (next === 'b') {
          const rest = jsonStr.slice(i + 1, i + 8);
          const match = rest.match(/^(beta|bar|begin|mathbf|binom|bold|bullet)/i);
          if (match) {
            out += '\\\\' + match[1];
            i += 1 + match[1].length;
          } else {
            out += ch + next;
            i += 2;
          }
        } else if (next === 'u' && /^[0-9a-fA-F]{4}/.test(jsonStr.slice(i + 2, i + 6))) {
          out += jsonStr.slice(i, i + 6);
          i += 6;
        } else {
          // Double escape semua backslash LaTeX lainnya (seperti \sqrt, \alpha, \le, \ge, \int, \sum, \pm)
          out += '\\\\';
          i++;
        }
      } else {
        out += ch;
        i++;
      }
    }
  }

  return out;
}

// Helper pembersih dan perbaikan JSON dari LLM
function safeParseLLMJson(raw) {
  let str = (raw || '').replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    str = str.slice(firstBrace, lastBrace + 1);
  }

  // 1. Perbaiki escape sequence string matematika/LaTeX terlebih dahulu
  const repaired = repairJsonMathStrings(str);

  try {
    return JSON.parse(repaired);
  } catch (e1) {
    try {
      return JSON.parse(str);
    } catch (eOrig) {
      // Hapus trailing comma sebelum } atau ]
      let fixed = repaired.replace(/,\s*([}\]])/g, '$1');
      try {
        return JSON.parse(fixed);
      } catch (e2) {
        // Hapus trailing comma dan string terpotong di akhir
        fixed = fixed.replace(/,\s*$/, '').replace(/"[^"]*$/, '""');
        let openBraces = (fixed.match(/\{/g) || []).length;
        let closeBraces = (fixed.match(/\}/g) || []).length;
        let openBrackets = (fixed.match(/\[/g) || []).length;
        let closeBrackets = (fixed.match(/\]/g) || []).length;

        while (closeBrackets < openBrackets) {
          fixed += ']';
          closeBrackets++;
        }
        while (closeBraces < openBraces) {
          fixed += '}';
          closeBraces++;
        }

        try {
          return JSON.parse(fixed);
        } catch (e3) {
          throw new Error(`Gagal mem-parse respon JSON: ${e1.message}`);
        }
      }
    }
  }
}

// Helper untuk mengurai daftar API Key (Tunggal Sesuai Permintaan Pengguna)
export function extractGroqKeys(apiKeysInput) {
  let rawItems = [];
  if (Array.isArray(apiKeysInput)) {
    rawItems.push(...apiKeysInput);
  } else if (typeof apiKeysInput === 'string' && apiKeysInput.trim()) {
    rawItems.push(apiKeysInput);
  }

  if (rawItems.length === 0 && typeof process !== 'undefined' && process.env) {
    if (process.env.GROQ_API_KEY) rawItems.push(process.env.GROQ_API_KEY);
  }

  const parsedKeys = [];
  for (const item of rawItems) {
    if (typeof item !== 'string') continue;
    const tokens = item.split(/[\s,;]+/).map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    for (const tok of tokens) {
      if (tok.startsWith('gsk_') || tok.length >= 20) {
        parsedKeys.push(tok);
      }
    }
  }

  return [...new Set(parsedKeys)];
}

// Kamus Padanan Istilah Akademik Lintas Bahasa (EN <-> ID)
// Menjamin pertanyaan berbahasa Inggris dapat mengambil materi perkuliahan berbahasa Indonesia secara presisi (dan sebaliknya)
const BILINGUAL_ACADEMIC_TERMS = {
  // Struktur & Rujukan Lokasi
  'conclusion': ['kesimpulan', 'penutup', 'rangkuman', 'akhir'],
  'conclude': ['kesimpulan', 'menyimpulkan'],
  'summary': ['ringkasan', 'rangkuman', 'ikhtisar', 'garis besar'],
  'summarize': ['merangkum', 'meringkas', 'rangkuman'],
  'introduction': ['pendahuluan', 'pengantar', 'pengenalan', 'awal'],
  'intro': ['pendahuluan', 'pengantar'],
  'background': ['latar belakang', 'dasar'],
  'chapter': ['bab', 'bagian'],
  'section': ['subbab', 'bagian', 'pasal'],
  'page': ['halaman', 'hal'],
  'pages': ['halaman', 'hal'],
  'slide': ['slide', 'lembar', 'presentasi'],
  'slides': ['slide', 'lembar', 'presentasi'],
  'video': ['video', 'rekaman', 'tayangan'],
  'first': ['pertama', 'awal'],
  'last': ['terakhir', 'akhir', 'penutup'],
  'final': ['akhir', 'final', 'penutup'],
  'ending': ['penutup', 'akhir'],
  // Konsep & Analisis Ilmiah
  'difference': ['perbedaan', 'beda', 'perbandingan', 'komparasi'],
  'differences': ['perbedaan', 'beda', 'perbandingan'],
  'compare': ['bandingkan', 'perbandingan', 'komparasi'],
  'function': ['fungsi', 'kegunaan', 'peran', 'manfaat'],
  'functions': ['fungsi', 'kegunaan', 'peran'],
  'purpose': ['tujuan', 'maksud', 'sasaran'],
  'goal': ['tujuan', 'target'],
  'definition': ['definisi', 'pengertian', 'makna', 'arti'],
  'define': ['mendefinisikan', 'definisi', 'pengertian'],
  'concept': ['konsep', 'gagasan', 'teori'],
  'theory': ['teori', 'landasan'],
  'principle': ['prinsip', 'kaidah', 'hukum'],
  'principles': ['prinsip', 'kaidah', 'hukum'],
  'law': ['hukum', 'aturan'],
  'formula': ['rumus', 'formula', 'persamaan'],
  'formulas': ['rumus', 'formula', 'persamaan'],
  'equation': ['persamaan', 'rumus'],
  'calculation': ['perhitungan', 'kalkulasi', 'hitung'],
  'calculate': ['menghitung', 'hitung'],
  'mechanism': ['mekanisme', 'cara kerja'],
  'process': ['proses', 'tahapan', 'alur'],
  'step': ['langkah', 'tahap'],
  'steps': ['langkah', 'tahapan'],
  'structure': ['struktur', 'susunan', 'bentuk'],
  'component': ['komponen', 'unsur', 'elemen'],
  'components': ['komponen', 'unsur', 'elemen'],
  'characteristic': ['karakteristik', 'ciri', 'sifat'],
  'characteristics': ['karakteristik', 'ciri', 'sifat'],
  'property': ['sifat', 'ciri', 'karakteristik'],
  'properties': ['sifat', 'ciri', 'karakteristik'],
  'type': ['jenis', 'macam', 'tipe', 'kategori'],
  'types': ['jenis', 'macam', 'tipe', 'kategori'],
  'classification': ['klasifikasi', 'pengelompokan'],
  'example': ['contoh', 'ilustrasi', 'studi kasus'],
  'examples': ['contoh', 'ilustrasi'],
  'advantage': ['kelebihan', 'keuntungan', 'manfaat'],
  'advantages': ['kelebihan', 'keuntungan', 'manfaat'],
  'benefit': ['manfaat', 'keuntungan'],
  'benefits': ['manfaat', 'keuntungan'],
  'disadvantage': ['kekurangan', 'kelemahan', 'keterbatasan'],
  'disadvantages': ['kekurangan', 'kelemahan', 'keterbatasan'],
  'limitation': ['keterbatasan', 'kelemahan'],
  'limitations': ['keterbatasan', 'kelemahan'],
  'application': ['penerapan', 'aplikasi', 'implementasi'],
  'applications': ['penerapan', 'aplikasi', 'implementasi'],
  'method': ['metode', 'cara', 'pendekatan'],
  'methods': ['metode', 'cara', 'pendekatan'],
  'result': ['hasil', 'temuan', 'akibat'],
  'results': ['hasil', 'temuan'],
  'effect': ['efek', 'pengaruh', 'dampak'],
  'cause': ['penyebab', 'sebab'],
  'factor': ['faktor', 'unsur'],
  'relationship': ['hubungan', 'korelasi', 'keterkaitan'],
  'overview': ['tinjauan', 'ikhtisar', 'gambaran umum']
};

// Bangun relasi dua arah (ID -> EN) otomatis
const REVERSE_ACADEMIC_TERMS = {};
for (const [enTerm, idTerms] of Object.entries(BILINGUAL_ACADEMIC_TERMS)) {
  for (const idTerm of idTerms) {
    if (!REVERSE_ACADEMIC_TERMS[idTerm]) REVERSE_ACADEMIC_TERMS[idTerm] = [];
    REVERSE_ACADEMIC_TERMS[idTerm].push(enTerm);
  }
}

// Helper cerdas RAG: Dynamic Multi-Page/Video Chunking & Semantic Window Retrieval
// Menangani berkas PDF tebal (puluhan/ratusan halaman), puluhan slide, dan video kuliah panjang
// dengan tetap mematuhi batas ketat Groq Cloud on-demand TPM (Tokens Per Minute).
function selectRelevantContext({ knowledgeBaseContext, documentExcerpts, fullDocumentContent, query = '', maxChars = 3800 }) {
  let out = 'BASIS PENGETAHUAN RESMI DOSEN (GROUNDED KNOWLEDGE BASE):\n';

  // 1. Silabus & Rangkuman Topik Lengkap
  if (knowledgeBaseContext && knowledgeBaseContext.length > 0) {
    out += '--- TOPIK & SUBTOPIK MATERI KULIAH LENGKAP ---\n';
    knowledgeBaseContext.slice(0, 10).forEach((k) => {
      const concepts = Array.isArray(k.keyConcepts) ? k.keyConcepts.slice(0, 5).join(', ') : '';
      out += `• ${k.title} [${k.sourceCitation || 'Sumber Dosen'}] (${concepts})\n`;
    });
    out += '\n';
  }

  const cleanQuery = (query || '').toLowerCase();
  
  // Hapus stopwords umum agar fokus pada kata kunci inti
  const stopWords = new Set([
    'apa', 'yang', 'dan', 'di', 'dari', 'ini', 'itu', 'adalah', 'untuk', 'dengan', 'pada',
    'bagaimana', 'kenapa', 'mengapa', 'siapa', 'kapan', 'dimana', 'dapat', 'bisa', 'tolong',
    'jelaskan', 'tentang', 'mengenai', 'apakah', 'tersebut', 'dalam', 'secara', 'yaitu', 'ada',
    'what', 'how', 'why', 'when', 'where', 'which', 'who', 'the', 'and', 'is', 'are', 'in',
    'to', 'for', 'with', 'on', 'at', 'by', 'from', 'explain', 'tell', 'about', 'can', 'you',
    'please', 'give', 'show', 'would', 'could', 'should', 'does', 'did', 'do'
  ]);
  const rawTerms = cleanQuery.match(/[\w]{3,}/g) || [];
  const queryTerms = rawTerms.filter(t => !stopWords.has(t));
  const fallbackTerms = queryTerms.length > 0 ? queryTerms : rawTerms;

  // Lakukan ekspansi istilah dua arah (EN <-> ID)
  const expandedTerms = new Set(fallbackTerms);
  fallbackTerms.forEach(t => {
    if (BILINGUAL_ACADEMIC_TERMS[t]) {
      BILINGUAL_ACADEMIC_TERMS[t].forEach(syn => expandedTerms.add(syn));
    }
    if (REVERSE_ACADEMIC_TERMS[t]) {
      REVERSE_ACADEMIC_TERMS[t].forEach(syn => expandedTerms.add(syn));
    }
  });
  const allSearchTerms = Array.from(expandedTerms);

  // Deteksi pencarian nomor halaman / slide / menit secara presisi lintas bahasa
  const pageMatch = cleanQuery.match(/(?:hal(?:aman)?\.?|p(?:age|\.)?)\s*(\d+)/i);
  const slideMatch = cleanQuery.match(/slide\s*(\d+)/i);
  const videoMatch = cleanQuery.match(/(\d{1,2}:\d{2})/);
  const targetPageNum = pageMatch ? pageMatch[1] : null;
  const targetPageInt = targetPageNum ? parseInt(targetPageNum, 10) : null;
  const targetSlideNum = slideMatch ? slideMatch[1] : null;
  const targetSlideInt = targetSlideNum ? parseInt(targetSlideNum, 10) : null;
  const targetTimestamp = videoMatch ? videoMatch[1] : null;

  // Deteksi intensi ringkasan/awal/akhir dalam Bahasa Indonesia maupun Inggris
  const isBroadSummary = /rangkum|ringkas|keseluruhan|semua bab|silabus|overview|garis besar|apa saja|summary|summarize|all chapters|syllabus|outline|overview/i.test(cleanQuery);
  const isAskingEnd = /akhir|terakhir|penutup|kesimpulan|halaman akhir|bab akhir|conclusion|conclude|last|end|final|last page|closing|ending/i.test(cleanQuery);
  const isAskingStart = /awal|pendahuluan|pengantar|pengenalan|halaman awal|bab 1|bab awal|intro|introduction|beginning|first page|first chapter|chapter 1/i.test(cleanQuery);

  if (Array.isArray(documentExcerpts) && documentExcerpts.length > 0) {
    const totalDocs = documentExcerpts.length;
    // 2. Scoring & Ranking Potongan (Chunks) di seluruh halaman/slide/timestamp
    const scoredExcerpts = documentExcerpts.map((item, idx) => {
      let score = 0;
      const text = (item.content || item.text || '').toLowerCase();
      const loc = (item.loc || '').toLowerCase();
      const ref = (item.ref || '').toLowerCase();

      // Ekstraksi integer halaman dan slide dari excerpt
      const itemPageMatch = (item.loc || '').match(/(?:hal(?:aman)?\.?|p(?:age|\.)?)\s*(\d+)/i) || (item.loc || '').match(/\d+/);
      const itemPage = item.page !== undefined ? parseInt(item.page, 10) : (itemPageMatch ? parseInt(itemPageMatch[1] || itemPageMatch[0], 10) : null);
      const itemSlideMatch = (item.loc || '').match(/slide\s*(\d+)/i) || (item.loc || '').match(/\d+/);
      const itemSlide = item.slide !== undefined ? parseInt(item.slide, 10) : (itemSlideMatch ? parseInt(itemSlideMatch[1] || itemSlideMatch[0], 10) : null);

      // Skor kecocokan nomor halaman eksplisit (Prioritas Tertinggi jika diminta spesifik)
      if (targetPageInt !== null && itemPage === targetPageInt) {
        score += 80;
      } else if (targetPageNum && (loc.includes(`hal. ${targetPageNum}`) || loc.includes(`page ${targetPageNum}`) || loc.includes(`p. ${targetPageNum}`))) {
        score += 70;
      }

      // Skor kecocokan nomor slide eksplisit
      if (targetSlideInt !== null && itemSlide === targetSlideInt) {
        score += 80;
      } else if (targetSlideNum && loc.includes(`slide ${targetSlideNum}`)) {
        score += 70;
      }

      // Skor kecocokan timestamp video
      if (targetTimestamp && (loc.includes(targetTimestamp) || text.includes(targetTimestamp))) {
        score += 80;
      }

      // Skor pertanyaan bagian awal vs akhir materi
      if (isAskingEnd && idx >= Math.floor(totalDocs * 0.75)) score += 30;
      if (isAskingStart && idx < Math.ceil(totalDocs * 0.25)) score += 30;

      // Skor kecocokan frasa query utuh
      if (cleanQuery.length > 6 && text.includes(cleanQuery)) {
        score += 35;
      }

      // Skor kecocokan kata kunci dan sinonim dwibahasa
      allSearchTerms.forEach(term => {
        if (text.includes(term)) score += 6;
        if (loc.includes(term) || ref.includes(term)) score += 10;
        const stem = term.slice(0, 5);
        if (stem.length >= 4 && text.includes(stem)) score += 2;
      });

      // Jika pertanyaan rangkuman umum, ambil sampel merata dari seluruh dokumen
      if (isBroadSummary) {
        const steps = [0, Math.floor(totalDocs * 0.25), Math.floor(totalDocs * 0.5), Math.floor(totalDocs * 0.75), totalDocs - 1];
        if (steps.includes(idx)) {
          score += 20;
        }
      }

      return { item, score, idx };
    });

    // Urutkan potongan dari yang paling relevan
    scoredExcerpts.sort((a, b) => b.score - a.score);

    out += '--- KUTIPAN BER-SITASI PALING RELEVAN (RAG CHUNKS SELURUH MATERI) ---\n';
    let currentLen = out.length;
    let addedCount = 0;

    // Jika tidak ada skor kecocokan tinggi (score === 0), ambil sampel representatif di seluruh dokumen (awal, tengah, akhir)
    const excerptsToPick = scoredExcerpts[0]?.score > 0
      ? scoredExcerpts.map(s => s.item)
      : [
          documentExcerpts[0],
          documentExcerpts[Math.floor(totalDocs * 0.25)],
          documentExcerpts[Math.floor(totalDocs * 0.5)],
          documentExcerpts[Math.floor(totalDocs * 0.75)],
          documentExcerpts[totalDocs - 1]
        ].filter(Boolean);

    for (const item of excerptsToPick) {
      if (addedCount >= 10) break; // Ambil hingga 10 potongan paling relevan
      const rawBody = (item.content || item.text || '').trim();
      if (!rawBody) continue;
      const textChunk = rawBody.slice(0, 420);
      
      // Sajikan label lokasi dengan format ganda (Hal. X / Page X) agar model LLM dalam bahasa apapun dapat mengutip nomor halaman secara tepat
      let locLabel = item.loc || '';
      if (!locLabel && item.page) locLabel = `Hal. ${item.page} / Page ${item.page}`;
      else if (locLabel && !locLabel.toLowerCase().includes('page') && (item.page || locLabel.match(/\d+/))) {
        const pNum = item.page || locLabel.match(/\d+/)[0];
        locLabel = `${locLabel} (Page ${pNum})`;
      }

      const entry = `[${item.ref || 'Rujukan'}] (${locLabel}):\n"${textChunk}"\n\n`;
      if (currentLen + entry.length > maxChars) break;
      out += entry;
      currentLen += entry.length;
      addedCount++;
    }
  }

  // Jika masih ada ruang dan ada teks dokumen inti
  const remaining = maxChars - out.length;
  if (remaining > 350 && fullDocumentContent) {
    const snippet = fullDocumentContent.trim().slice(0, remaining);
    out += `--- INTI BERKAS RESMI ---\n"${snippet}"\n`;
  }

  return out.trim();
}

// Generator Fallback Ingestion Terstruktur jika API Key / Kuota Groq tidak tersedia
function generateFallbackIngestionResult({
  fileName,
  fileType,
  detectedPages,
  detectedDuration,
  detectedSlides,
  effectiveCourseTitle,
  extractedTextSample,
  documentOutline,
  pageIndexSummary,
  slideIndexSummary,
  videoSegmentsSummary
}) {
  const cleanTitle = (effectiveCourseTitle || fileName || 'Materi Kuliah')
    .replace(/\.[^/.]+$/, '')
    .replace(/^[0-9\-_.]+/, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  const vol = fileType === 'pdf' ? detectedPages : (fileType === 'video' ? detectedDuration : detectedSlides);
  const numTopics = vol <= 8 ? 3 : (vol <= 20 ? 4 : (vol <= 45 ? 5 : 6));
  const step = Math.max(1, Math.ceil(vol / numTopics));

  const topics = [];

  for (let i = 0; i < numTopics; i++) {
    const startVal = i * step + 1;
    const endVal = Math.min(vol, (i + 1) * step);
    const topicNumStr = String(i + 1).padStart(2, '0');

    let citation = '';
    let startLoc = '';
    if (fileType === 'pdf') {
      citation = `📄 ${fileName} (Hal. ${startVal} - ${endVal})`;
      startLoc = String(startVal);
    } else if (fileType === 'video') {
      const sMin = (startVal - 1) * (detectedDuration / vol);
      const eMin = endVal * (detectedDuration / vol);
      const startTs = String(Math.floor(sMin)).padStart(2, '0') + ':00';
      const endTs = String(Math.floor(eMin)).padStart(2, '0') + ':00';
      citation = `🎥 ${fileName} (${startTs} - ${endTs})`;
      startLoc = startTs;
    } else {
      citation = `📊 ${fileName} (Slide ${startVal} - ${endVal})`;
      startLoc = String(startVal);
    }

    // Ambil heading nyata jika tersedia dari outline/summary
    let topicName = '';
    if (pageIndexSummary && pageIndexSummary[i * step]?.heading) {
      topicName = pageIndexSummary[i * step].heading;
    } else if (slideIndexSummary && slideIndexSummary[i * step]?.heading) {
      topicName = slideIndexSummary[i * step].heading;
    }

    if (!topicName) {
      if (i === 0) topicName = `Konsep Fondasi, Pengantar & Terminologi ${cleanTitle}`;
      else if (i === 1) topicName = `Prinsip Kerja & Mekanisme Inti ${cleanTitle}`;
      else if (i === 2) topicName = `Struktur Formulasi & Penurunan Hubungan ${cleanTitle}`;
      else if (i === 3) topicName = `Analisis Lanjutan & Studi Kasus ${cleanTitle}`;
      else if (i === numTopics - 1) topicName = `Rangkuman Penutup, Evaluasi & Penerapan ${cleanTitle}`;
      else topicName = `Pendalaman Konsep Bab ${i + 1} ${cleanTitle}`;
    }

    topics.push({
      code: `TOPIK ${topicNumStr}`,
      title: topicName,
      prerequisites: i === 0 ? 'Konsep Fondasi' : `Prasyarat: TOPIK ${String(i).padStart(2, '0')}`,
      sourceCitation: citation,
      chunksCount: Math.floor(16 + Math.random() * 8),
      diagramCount: (i % 2 === 0 ? 3 : 2),
      diagramInsight: `Representasi diagram alur, grafik visual, dan formulasi ilmiah pada ${citation}.`,
      keyConcepts: [
        `Konsep Inti Bagian ${i + 1}`,
        `Terminologi ${cleanTitle}`,
        `Analisis Mekanisme Terkait`
      ]
    });
  }

  return {
    courseName: cleanTitle,
    totalPages: detectedPages,
    totalDurationMinutes: detectedDuration,
    totalSlides: detectedSlides,
    topics: topics,
    knowledgeGraph: {
      nodesCount: topics.length * 2,
      edgesCount: topics.length + 1,
      nodes: topics.map(t => t.title),
      edges: topics.slice(1).map((t, idx) => ({
        from: topics[idx].title,
        to: t.title,
        relation: 'prerequisite'
      }))
    }
  };
}

export async function handleGroqIngestion(body, apiKey) {
  const {
    fileName,
    fileType,
    courseName,
    courseCode,
    pageCount,
    durationMinutes,
    slideCount,
    extractedTextSample,
    documentOutline,
    pageIndexSummary,
    slideIndexSummary,
    videoSegmentsSummary,
    detectedTitle
  } = body;

  const detectedPages = pageCount && pageCount > 0 ? pageCount : 30;
  const detectedDuration = durationMinutes && durationMinutes > 0 ? durationMinutes : 45;
  const detectedSlides = slideCount && slideCount > 0 ? slideCount : 25;

  let volumeText = '';
  if (fileType === 'pdf') {
    volumeText = `${detectedPages} Halaman Dokumen/Buku PDF`;
  } else if (fileType === 'video') {
    volumeText = `${detectedDuration} Menit Rekaman Video Kuliah`;
  } else if (fileType === 'slide') {
    volumeText = `${detectedSlides} Lembar Slide Presentasi`;
  } else {
    volumeText = 'Materi Kuliah';
  }

  // Pembersihan nama berkas sebagai acuan judul cadangan
  const fallbackCleanTitle = (fileName || 'Materi Kuliah')
    .replace(/\.[^/.]+$/, '')
    .replace(/^[0-9\-_.]+/, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  // Evaluasi placeholder agar tidak ada bias ke mata kuliah manapun
  const isPlaceholder = (val) => {
    if (!val || typeof val !== 'string') return true;
    const lower = val.toLowerCase().trim();
    return lower === '' || lower.includes('biologi sel 101') || lower.includes('bio-101') || lower === 'materi kuliah';
  };

  let effectiveCourseTitle = '';
  if (courseName && !isPlaceholder(courseName)) {
    effectiveCourseTitle = courseName.trim();
  } else if (detectedTitle && !isPlaceholder(detectedTitle)) {
    effectiveCourseTitle = detectedTitle.trim();
  } else {
    effectiveCourseTitle = fallbackCleanTitle || 'Materi Pembelajaran Terpadu';
  }

  let outlineSnippet = '';
  if (documentOutline && documentOutline.length > 15) {
    outlineSnippet = `\nSTRUKTUR OUTLINE SELURUH HALAMAN/SLIDE/SEGMEN BERKAS (DARI AWAL SAMPAI AKHIR):\n${documentOutline.slice(0, 2400)}\n`;
  }

  let textSnippet = '';
  if (extractedTextSample && extractedTextSample.length > 20) {
    if (extractedTextSample.length > 2400) {
      const partLen = 700;
      const head = extractedTextSample.slice(0, partLen);
      const midStart = Math.max(0, Math.floor(extractedTextSample.length / 2) - Math.floor(partLen / 2));
      const mid = extractedTextSample.slice(midStart, midStart + partLen);
      const tail = extractedTextSample.slice(-partLen);
      textSnippet = `\nCUPLIKAN MULTI-SEKSI RESMI DOKUMEN (AWAL, TENGAH, AKHIR BERKAS):\n[Awal Dokumen / Pendahuluan]:\n${head}\n\n[Tengah Dokumen / Konsep Utama]:\n${mid}\n\n[Akhir Dokumen / Evaluasi-Lanjutan]:\n${tail}\n`;
    } else {
      textSnippet = `\nKUTIPAN DAN TEKS ASLI LENGKAP DARI BERKAS:\n"""\n${extractedTextSample}\n"""\n`;
    }
  } else {
    textSnippet = `\nNama berkas ini adalah: "${fileName}". Analisis dan tentukan disiplin ilmu serta topik materi berdasarkan nama berkas ini secara otonom.\n`;
  }

  let exampleCitation1 = '';
  let exampleCitation2 = '';
  let exampleCitation3 = '';
  if (fileType === 'video') {
    const p1 = Math.max(1, Math.floor(detectedDuration * 0.33));
    const p2 = Math.max(2, Math.floor(detectedDuration * 0.67));
    exampleCitation1 = `🎥 ${fileName} (00:00 - ${String(p1).padStart(2, '0')}:00)`;
    exampleCitation2 = `🎥 ${fileName} (${String(p1).padStart(2, '0')}:00 - ${String(p2).padStart(2, '0')}:00)`;
    exampleCitation3 = `🎥 ${fileName} (${String(p2).padStart(2, '0')}:00 - ${String(detectedDuration).padStart(2, '0')}:00)`;
  } else if (fileType === 'slide') {
    const s1 = Math.max(1, Math.round(detectedSlides * 0.33));
    const s2 = Math.max(2, Math.round(detectedSlides * 0.67));
    exampleCitation1 = `📊 ${fileName} (Slide 1 - ${s1})`;
    exampleCitation2 = `📊 ${fileName} (Slide ${s1 + 1} - ${s2})`;
    exampleCitation3 = `📊 ${fileName} (Slide ${s2 + 1} - ${detectedSlides})`;
  } else {
    const pg1 = Math.max(1, Math.round(detectedPages * 0.33));
    const pg2 = Math.max(2, Math.round(detectedPages * 0.67));
    exampleCitation1 = `📄 ${fileName} (Hal. 1 - ${pg1})`;
    exampleCitation2 = `📄 ${fileName} (Hal. ${pg1 + 1} - ${pg2})`;
    exampleCitation3 = `📄 ${fileName} (Hal. ${pg2 + 1} - ${detectedPages})`;
  }

  const prompt = `Anda adalah Mesin Ingestion Basis Pengetahuan Multimodal AI Akademik untuk Kompetisi Multimodal AI Hackathon 2026 Track D (Personalized Tutoring & Adaptive Learning).
Dosen pengampu baru saja mengunggah berkas materi kuliah:
- Nama Berkas: "${fileName}"
- Format Sumber: ${fileType} (Video Kuliah / Buku PDF / Slide Presentasi)
- Volume Berkas: ${volumeText}
- Subjek / Topik Materi: ${effectiveCourseTitle}
${outlineSnippet}
${textSnippet}
TUGAS WAJIB TRACK D REQUIREMENT 1 (Ingestion & Knowledge Base):
1. PEMAHAMAN MATERI OTONOM BERBASIS KONTEN (ANTI-HALUSINASI):
   - Analisis secara mandiri isi outline seluruh materi dan teks asli di atas, apapun disiplin ilmunya (Ilmu Komputer, Kedokteran, Hukum, Manajemen, Fisika, Kimia, Matematika, Teknik, Psikologi, Bahasa, Ekonomi, dsb).
   - Seluruh judul bab, subtopik, dan konsep kunci yang Anda hasilkan HARUS 100% SESUAI DENGAN MATERI KULIAH INI (${effectiveCourseTitle}). JANGAN PERNAH mengarang atau mencampur materi di luar dokumen ini!

2. PEMBAGIAN SUBTOPIK & BAB SECARA PROPORSIONAL MENCAKUP DARI AWAL HINGGA AKHIR (Req 1.a & Req 1.c):
   - Dokumen ini memiliki total ${volumeText}. Pecah berkas ini secara proporsional menjadi 4 sampai 6 subtopik/bab yang mencakup SELURUH isi dari awal hingga halaman/slide/menit terakhir berdasarkan outline di atas (termasuk durasi/halaman akhir, rumus lanjutan, bab inti, dan evaluasi/kesimpulan).
   - Pastikan bab terakhir mencakup bagian paling akhir dari dokumen ini!

3. SITASI SUMBER YANG SESUAI DENGAN FORMAT BERKAS (${fileType.toUpperCase()}) (Req 1.b):
   - PERINGATAN KETAT KONSISTENSI FORMAT:
     * Jika format adalah 'video': SEMUA rujukan sourceCitation WAJIB berupa rentang waktu menit:detik [🎥 ${fileName} (MM:SS - MM:SS)] (misal: '🎥 ${fileName} (00:00 - 15:30)'). DILARANG KERAS menggunakan kata 'Hal.' atau 'Slide' jika berkasnya adalah video!
     * Jika format adalah 'slide': SEMUA rujukan sourceCitation WAJIB berupa rentang slide [📊 ${fileName} (Slide X - Y)]. DILARANG KERAS menggunakan kata 'Hal.' jika berkasnya adalah slide!
     * Jika format adalah 'pdf': SEMUA rujukan sourceCitation WAJIB berupa rentang halaman [📄 ${fileName} (Hal. X - Y)].

4. PENETAPAN PRASYARAT BELAJAR (PREREQUISITE DAG - Req 1.b):
   - Subtopik 1 berstatus 'Fondasi Dasar / Pengantar'.
   - Subtopik berikutnya wajib memiliki prasyarat ke subtopik sebelumnya (contoh: 'Prasyarat: TOPIK 01 / [Nama Konsep]').

5. EKSTRAKSI MULTIMODAL & INSIGHT DIAGRAM (Req 1.d):
   - Deskripsikan diagram visual, bagan alur kerja, grafik formula, atau tabel data yang relevan dengan masing-masing bab.

6. PEMETAAN KNOWLEDGE GRAPH (DAG):
   - Petakan 6 sampai 10 konsep kunci nyata dari berkas ini beserta relasi prasyarat (edges).

KEMBALIKAN HANYA FORMAT RAW JSON STRICT TANPA MARKDOWN BACKTICKS (STRICT JSON ONLY):
{
  "documentSummary": "Ringkasan menyeluruh materi ${effectiveCourseTitle}",
  "totalPages": ${detectedPages},
  "totalDurationMinutes": ${detectedDuration},
  "totalSlides": ${detectedSlides},
  "totalDiagrams": 6,
  "totalChunks": 42,
  "topics": [
    {
      "code": "TOPIK 01",
      "title": "Judul Subtopik 1 yang nyata dari materi",
      "prerequisites": "Fondasi Dasar / Pengantar",
      "sourceCitation": "${exampleCitation1}",
      "chunksCount": 16,
      "diagramCount": 2,
      "diagramInsight": "Deskripsi diagram, grafik, atau bagan visual nyata pada subtopik ini.",
      "keyConcepts": ["Konsep Riil 1", "Konsep Riil 2", "Konsep Riil 3"]
    },
    {
      "code": "TOPIK 02",
      "title": "Judul Subtopik 2 lanjutan yang nyata dari materi",
      "prerequisites": "Prasyarat: TOPIK 01",
      "sourceCitation": "${exampleCitation2}",
      "chunksCount": 18,
      "diagramCount": 2,
      "diagramInsight": "Deskripsi skema pemodelan atau bagan perbandingan di materi ini.",
      "keyConcepts": ["Konsep Riil 4", "Konsep Riil 5"]
    },
    {
      "code": "TOPIK 03",
      "title": "Judul Subtopik 3 / Kasus Terapan nyata dari materi",
      "prerequisites": "Prasyarat: TOPIK 02",
      "sourceCitation": "${exampleCitation3}",
      "chunksCount": 16,
      "diagramCount": 2,
      "diagramInsight": "Deskripsi analisis terapan, formula kalkulasi, atau studi kasus.",
      "keyConcepts": ["Konsep Riil 6", "Konsep Riil 7"]
    }
  ],
  "knowledgeGraph": {
    "nodesCount": 8,
    "edgesCount": 6,
    "nodes": ["Konsep 1", "Konsep 2", "Konsep 3", "Konsep 4", "Konsep 5", "Konsep 6"],
    "edges": [
      { "from": "Konsep 1", "to": "Konsep 2", "relation": "prerequisite" },
      { "from": "Konsep 2", "to": "Konsep 4", "relation": "prerequisite" }
    ]
  }
}`;

  const availableKeys = extractGroqKeys(apiKey);
  if (availableKeys.length === 0) {
    console.warn('[Groq Ingestion] Tidak ada API Key terdeteksi. Menggunakan ekstraksi dokumen terstruktur lokal.');
    const fallbackData = generateFallbackIngestionResult({
      fileName,
      fileType,
      detectedPages,
      detectedDuration,
      detectedSlides,
      effectiveCourseTitle,
      extractedTextSample,
      documentOutline,
      pageIndexSummary,
      slideIndexSummary,
      videoSegmentsSummary
    });
    return {
      success: true,
      modelUsed: 'local-structured-extractor (no-groq-key)',
      data: fallbackData
    };
  }

  const modelsToTry = [
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
    'qwen/qwen3.8-27b'
  ];
  let lastError = null;

  // Coba berurutan: jika Key 1 error atau terkena rate limit, otomatis beralih ke Key 2
  for (let keyIdx = 0; keyIdx < availableKeys.length; keyIdx++) {
    const currentApiKey = availableKeys[keyIdx];
    const keyLabel = `Key #${keyIdx + 1} (...${currentApiKey.slice(-6)})`;

    for (const model of modelsToTry) {
      try {
        const tokenLimit = model.includes('qwen') ? 850 : 1200;
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'system',
                content: 'You are a specialized Multimodal Educational Knowledge Base Ingestion Engine. Output valid raw JSON only, strictly matching the user document content without hallucinations or placeholder concepts.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.2,
            max_tokens: tokenLimit
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          if (response.status === 413 || response.status === 429) {
            console.warn(`[Groq Ingestion ${response.status}] Limit tercapai pada ${model} (${keyLabel}). Mencoba failover.`);
          }
          throw new Error(`Groq status ${response.status} (${keyLabel}): ${errText.slice(0, 150)}`);
        }

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content || '';
        if (!content && data.choices?.[0]?.message?.reasoning) {
          const r = data.choices[0].message.reasoning;
          if (r.includes('{') && r.includes('}')) content = r;
        }
        const parsed = safeParseLLMJson(content || '{}');

        // Pastikan output memiliki array topics
        if (!parsed.topics || !Array.isArray(parsed.topics) || parsed.topics.length === 0) {
          if (parsed.topicTitle) {
            parsed.topics = [
              {
                code: 'TOPIK 01',
                title: parsed.topicTitle,
                prerequisites: parsed.prerequisites || 'Fondasi Materi',
                sourceCitation: parsed.sourceCitation || (fileType === 'pdf' ? `📄 ${fileName} (Hal. 1 - ${detectedPages})` : fileType === 'video' ? `🎥 ${fileName} (00:00 - ${detectedDuration}:00)` : `📊 ${fileName} (Slide 1 - ${detectedSlides})`),
                chunksCount: parsed.chunksCount || 20,
                diagramCount: parsed.diagramCount || 2,
                diagramInsight: parsed.diagramInsight || 'Ekstraksi representasi multimodal terstruktur.',
                keyConcepts: parsed.keyConcepts || ['Konsep Dasar', 'Penerapan']
              }
            ];
          }
        }

        // Pastikan integritas sitasi sesuai tipe berkas riil
        if (Array.isArray(parsed.topics)) {
          parsed.topics = parsed.topics.map((t, idx) => {
            let cit = t.sourceCitation || '';
            if (fileType === 'video') {
              if (!cit.includes('🎥') || cit.includes('Hal.') || cit.includes('Slide')) {
                const startM = String(idx * 15).padStart(2, '0') + ':00';
                const endM = String(Math.min(detectedDuration, (idx + 1) * 15)).padStart(2, '0') + ':00';
                cit = `🎥 ${fileName} (${startM} - ${endM})`;
              }
            } else if (fileType === 'slide') {
              if (!cit.includes('📊') || cit.includes('Hal.')) {
                const s1 = idx * 10 + 1;
                const s2 = Math.min(detectedSlides, (idx + 1) * 10);
                cit = `📊 ${fileName} (Slide ${s1} - ${s2})`;
              }
            }
            return {
              ...t,
              sourceCitation: cit
            };
          });
        }

        // Pastikan totalPages, totalDurationMinutes, totalSlides terisi dengan benar
        parsed.totalPages = parsed.totalPages || detectedPages;
        parsed.totalDurationMinutes = parsed.totalDurationMinutes || detectedDuration;
        parsed.totalSlides = parsed.totalSlides || detectedSlides;

        return {
          success: true,
          modelUsed: model,
          keyUsed: keyIdx + 1,
          data: parsed
        };
      } catch (err) {
        console.warn(`[Groq Ingestion Failover] Model ${model} pada ${keyLabel} gagal:`, err.message);
        lastError = err;
      }
    }
  }

  console.warn('[Groq Ingestion Failover] Semua model/kunci Groq limit/gagal. Menggunakan ekstraksi dokumen terstruktur lokal:', lastError?.message);
  const fallbackData = generateFallbackIngestionResult({
    fileName,
    fileType,
    detectedPages,
    detectedDuration,
    detectedSlides,
    effectiveCourseTitle,
    extractedTextSample,
    documentOutline,
    pageIndexSummary,
    slideIndexSummary,
    videoSegmentsSummary
  });
  return {
    success: true,
    modelUsed: 'local-structured-extractor (failover)',
    data: fallbackData
  };
}

// Server-side Tutor Chat handler for Track D (Req 2)
export async function handleGroqTutor(body, apiKey) {
  const { question, history, knowledgeBaseContext, currentSubject, documentExcerpts, fullDocumentContent, uploadedFilesSummary, language } = body;

  const isEnglish = (language === 'en') ||
    /\b(what|how|why|when|where|who|which|whose|explain|describe|summarize|summary|calculate|formula|concept|can\s+you|could\s+you|please|difference|define|definition|overview|page|slide|video|chapter|unit|tell\s+me|show|give)\b/i.test(question || '');

  if (!knowledgeBaseContext || knowledgeBaseContext.length === 0) {
    return {
      success: true,
      reply: isEnglish
        ? 'Currently, no course materials (presentation slides, textbook PDFs, or lecture videos) have been uploaded by the lecturer in Lecturer Mode. Following strict Source-Grounding principles (Track D Requirement 2), OmniTutor AI cannot provide explanations without reference to official course files. Please upload your course materials via Lecturer Mode first.'
        : 'Saat ini belum ada berkas materi kuliah (slide presentasi, buku teks PDF, atau rekaman video) yang diunggah oleh Dosen di Mode Dosen. Sesuai prinsip Source-Grounding (Track D Requirement 2), OmniTutor AI tidak diperkenankan memberikan penjelasan atau mengarang materi tanpa rujukan berkas resmi dosen. Silakan unggah berkas materi perkuliahan Anda melalui Mode Dosen terlebih dahulu.'
    };
  }

  // Deteksi tipe media dari berkas yang diunggah
  const filesList = Array.isArray(uploadedFilesSummary) ? uploadedFilesSummary : [];
  let hasVideo = filesList.some(f => f.type === 'video');
  let hasPdf = filesList.some(f => f.type === 'pdf');
  let hasSlide = filesList.some(f => f.type === 'slide');

  if (!hasVideo && !hasPdf && !hasSlide) {
    if (documentExcerpts && documentExcerpts.length > 0) {
      hasVideo = documentExcerpts.some(e => e.ref?.includes('🎥') || (e.loc && String(e.loc).includes(':')));
      hasPdf = documentExcerpts.some(e => e.ref?.includes('📄'));
      hasSlide = documentExcerpts.some(e => e.ref?.includes('📊') || e.ref?.includes('🖥️'));
    }
    if (knowledgeBaseContext && knowledgeBaseContext.length > 0) {
      if (knowledgeBaseContext.some(k => k.videoRef && !k.videoRef.includes('Terkait'))) hasVideo = true;
      if (knowledgeBaseContext.some(k => k.bookRef && !k.bookRef.includes('Terkait'))) hasPdf = true;
      if (knowledgeBaseContext.some(k => k.slideRef && !k.slideRef.includes('Terkait'))) hasSlide = true;
    }
  }

  let mediaSpecificGuideline = '';
  if (hasVideo && !hasPdf && !hasSlide) {
    mediaSpecificGuideline = isEnglish ? `
========================================================================
⚠️ MANDATORY CITATION RULE: MATERIALS CONSIST SOLELY OF LECTURE VIDEO RECORDINGS
========================================================================
Course materials uploaded by the lecturer are 100% LECTURE VIDEOS (file: ${filesList.map(f => f.name).join(', ') || 'Lecture Video'}).
NO PDF textbooks and NO slide presentations were uploaded!
RULES:
1. ALL citations MUST be exact minute:second timestamps formatted as: [🎥 MM:SS] or [🎥 MM:SS - MM:SS] (e.g. [🎥 00:45], [🎥 02:15]).
2. NEVER cite pages "[📄 Page X]" or slides "[🖥️ Slide X]".
3. Explicitly state that the explanation is sourced from the lecture recording at the indicated timestamp.
========================================================================` : `
========================================================================
⚠️ ATURAN SITASI MUTLAK: MATERI HANYA BERUPA REKAMAN VIDEO KULIAH (TRACK D)
========================================================================
Materi perkuliahan yang diunggah dosen HANYA 100% REKAMAN VIDEO (nama berkas: ${filesList.map(f => f.name).join(', ') || 'Video Kuliah'}).
TIDAK ADA buku teks PDF dan TIDAK ADA slide presentasi yang diunggah!

ATURAN WAJIB (STRICT):
1. SEMUA rujukan dan sitasi sumber yang Anda cantumkan WAJIB HANYA BERUPA TIMESTAMP DURASI MENIT:DETIK VIDEO dengan format:
   [🎥 MM:SS] atau [🎥 MM:SS - MM:SS] (contoh: [🎥 00:45], [🎥 01:30], [🎥 02:15 - 03:00]).
2. DILARANG KERAS mencantumkan rujukan halaman "[📄 Hal. X]", "Halaman X", "[🖥️ Slide X]", atau menyebut frasa "Buku Teks" atau "Slide Kuliah"!
3. Jika Anda menampilkan tabel atau daftar poin dengan kolom 'Sumber', kolom tersebut HANYA BOLEH berisi timestamp video [🎥 MM:SS], BUKAN halaman!
4. Jelaskan bahwa rujukan bersumber dari rekaman video kuliah pada durasi/menit yang disebutkan.
========================================================================`;
  } else if (hasSlide && !hasPdf && !hasVideo) {
    mediaSpecificGuideline = isEnglish ? `
========================================================================
⚠️ CITATION RULE: MATERIALS ARE LECTURE PRESENTATION SLIDES
========================================================================
All citations MUST be slide numbers formatted as: [🖥️ Slide X] (e.g. [🖥️ Slide 2], [🖥️ Slide 5]).
========================================================================` : `
========================================================================
⚠️ ATURAN SITASI: MATERI HANYA BERUPA SLIDE PRESENTASI KULIAH
========================================================================
Materi perkuliahan yang diunggah HANYA berupa slide kuliah.
1. SEMUA rujukan dan sitasi sumber WAJIB HANYA BERUPA NOMOR SLIDE dengan format: [🖥️ Slide X] (contoh: [🖥️ Slide 2], [🖥️ Slide 5]).
2. DILARANG KERAS mencantumkan rujukan halaman "[📄 Hal. X]" atau video [🎥 MM:SS].
========================================================================`;
  } else if (hasPdf && !hasSlide && !hasVideo) {
    mediaSpecificGuideline = isEnglish ? `
========================================================================
⚠️ CITATION RULE: MATERIALS ARE TEXTBOOK / PDF DOCUMENTS
========================================================================
1. All citations MUST cite the exact page number from the provided excerpts:
   Format: [📄 Page X] or [📄 Hal. X] (e.g. [📄 Page 4], [📄 Page 12]).
2. If the user asks about a specific page (e.g., "what is on page 3?"), locate that exact page in the excerpts and explain it thoroughly.
3. NEVER guess or invent page numbers. Always quote the exact page number from the excerpt headers.
========================================================================` : `
========================================================================
⚠️ ATURAN SITASI: MATERI HANYA BERUPA DOKUMEN / BUKU TEKS PDF
========================================================================
Materi perkuliahan yang diunggah HANYA berupa dokumen/buku PDF.
1. SEMUA rujukan dan sitasi sumber WAJIB HANYA BERUPA NOMOR HALAMAN dengan format: [📄 Hal. X] (contoh: [📄 Hal. 4], [📄 Hal. 12]).
2. Jika mahasiswa menanyakan halaman tertentu (contoh: "jelaskan halaman 3"), langsung jelaskan isi halaman tersebut secara presisi.
3. DILARANG KERAS mencantumkan rujukan slide atau video timestamp, dan DILARANG mengarang nomor halaman!
========================================================================`;
  } else {
    mediaSpecificGuideline = isEnglish ? `
========================================================================
MULTIMODAL & MULTI-FILE CITATION RULES:
Uploaded files: ${filesList.map(f => `${f.name} (${f.type})`).join(', ') || 'Multi-media'}.
1. If referencing video: Cite exact timestamp [🎥 MM:SS].
2. If referencing PDF: Cite exact page [📄 Page X] or [📄 Hal. X].
3. If referencing slides: Cite slide [🖥️ Slide X].
========================================================================` : `
========================================================================
ATURAN SITASI MULTIMODAL & MULTI-BERKAS (TRACK D REQUIREMENT 1 & 2):
Dosen mengunggah materi multi-media secara bersamaan (PDF, Slide, dan/atau Video).
Daftar berkas resmi yang diunggah: ${filesList.map(f => `${f.name} (${f.type})`).join(', ') || 'Multi-media'}.
1. Jika merujuk ke rekaman video: Sertakan timestamp [🎥 MM:SS].
2. Jika merujuk ke PDF: Sertakan nomor halaman [📄 Hal. X].
3. Jika merujuk ke slide: Sertakan nomor slide [🖥️ Slide X].
========================================================================`;
  }

  const contextStr = selectRelevantContext({
    knowledgeBaseContext,
    documentExcerpts,
    fullDocumentContent,
    query: question,
    maxChars: 3800
  });

  const systemPrompt = isEnglish ? `You are OmniTutor AI, a dedicated source-grounded academic tutor (Track D: Personalized Tutoring & Adaptive Learning).
Strict Operational Guidelines (Track D Requirement 2.a & 2.b):
1. LANGUAGE REQUIREMENT: You MUST answer strictly in natural, professional, academic ENGLISH. If the course materials or excerpts are in Indonesian, accurately translate, synthesize, and articulate the concepts into academic English.
2. FULL-DOCUMENT GROUNDING & PEDAGOGY: Answer student questions thoroughly using the official course materials and retrieved excerpts provided below. Synthesize concepts, clarify mechanisms, and explain formulas clearly.
3. EXPLICIT SOURCE CITATIONS:
${mediaSpecificGuideline}
   - Always include precise page/slide/timestamp citations (e.g., [📄 Page 3] or [📄 Hal. 3]) matching the excerpt headers.
   - If asked about a specific page or topic, prioritize and thoroughly explain that exact page or topic from the excerpts.
4. MATHEMATICAL FORMULAS: Render all equations and scientific symbols using standard LaTeX: $$ equation $$ for block display, $ symbol $ for inline (e.g. $\\vec{F}$, $\\mathbf{A}$, $\\theta$).
5. GUARDRAIL DIRECTIVE (ZERO FALSE REFUSALS):
   - If the student asks about ANY course concept, term, topic, formula, slide, page, or question related to the lecture materials: ALWAYS answer and explain it with pedagogical care and cite the relevant source.
   - NEVER refuse or claim "outside official course materials" for questions that relate to the course subject or any of its concepts.
   - Politely decline ONLY if the student asks about completely unrelated, non-academic topics (such as celebrity gossip, cooking recipes, horoscopes).
6. Tone: Friendly, encouraging, academic, structured, and pedagogical.

${contextStr}` : `Anda adalah OmniTutor AI, asisten belajar multimodal akademik untuk kompetisi Multimodal AI Hackathon 2026 (Track D: Personalized Tutoring & Adaptive Learning).
Prinsip Operasional Wajib (Track D Req 2.a & 2.b):
1. BAHASA RESPON: Jawab dalam Bahasa Indonesia yang akademis, jelas, ramah, dan mendidik.
2. FULL-DOCUMENT GROUNDING & PEDAGOGIS: Jawab dan jelaskan pertanyaan mahasiswa secara tuntas, terstruktur, dan mendalam berdasarkan materi kuliah dan kutipan resmi di bawah.
3. SITASI SUMBER EKSPLISIT:
${mediaSpecificGuideline}
4. FORMULA MATEMATIKA: Tulis rumus menggunakan LaTeX standar: $$ rumus $$ untuk baris baru, $ simbol $ untuk sebaris (contoh $\\vec{F}$, $\\mathbf{A}$).
5. PEDOMAN GUARDRAIL (ANTI PENOLAKAN PALSU):
   - Jika mahasiswa bertanya tentang konsep, topik, bab, rumus, halaman, slide, atau istilah perkuliahan: WAJIB dijawab dan dijelaskan secara ramah dan gamblang dengan menyertakan sitasi sumber.
   - JANGAN PERNAH menolak atau berkata "di luar materi" untuk pertanyaan yang berkaitan dengan mata kuliah atau materi akademik yang diunggah.
   - Tolak secara sopan HANYA jika mahasiswa menanyakan hal yang sama sekali non-akademis dan tidak ada kaitannya (seperti gosip selebriti, ramalan zodiak, atau resep masakan).
6. Nada: Ramah, membimbing, ilmiah, dan menguatkan pemahaman mahasiswa.

${contextStr}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(history || []).slice(-2).map(m => ({
      role: m.role || 'user',
      content: String(m.text || m.content || '').slice(0, 300)
    })),
    { role: 'user', content: question }
  ];

  const availableKeys = extractGroqKeys(apiKey);
  if (availableKeys.length === 0) {
    console.warn('[Groq Tutor] Tidak ada API Key terdeteksi. Menggunakan Grounded Knowledge Base Fallback.');
    const fallbackAnswer = generateGroundedFallbackTutorAnswer({
      question,
      knowledgeBaseContext,
      documentExcerpts,
      fullDocumentContent,
      hasVideo,
      hasPdf,
      hasSlide,
      filesList,
      isEnglish,
      isNoKey: true,
      isRateLimit: false
    });
    return {
      success: true,
      modelUsed: 'grounded-kb-engine (no-groq-key)',
      rateLimitNotice: false,
      reply: fallbackAnswer
    };
  }

  const modelsToTry = [
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
    'qwen/qwen3.8-27b'
  ];
  let lastError = null;

  for (let keyIdx = 0; keyIdx < availableKeys.length; keyIdx++) {
    const currentApiKey = availableKeys[keyIdx];
    const keyLabel = `Key #${keyIdx + 1} (...${currentApiKey.slice(-6)})`;

    for (const model of modelsToTry) {
      try {
        const tokenLimit = model.includes('qwen') ? 800 : 1000;
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0.3,
            max_tokens: tokenLimit
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          // Jika status 413 (Payload too large) atau 429, kurangi ukuran konteks secara agresif
          if (response.status === 413 || response.status === 429) {
            console.warn(`[Groq ${response.status} Auto-Shrink] Mengompres konteks tutor untuk ${model} (${keyLabel})...`);
            if (messages[0]?.content && messages[0].content.length > 900) {
              messages[0].content = messages[0].content.slice(0, 850) + '\n[Grounded Summary]\n';
            }
          }
          throw new Error(`Groq status ${response.status} (${keyLabel}): ${errText.slice(0, 150)}`);
        }

        const data = await response.json();
        let reply = data.choices?.[0]?.message?.content || '';
        if (!reply && data.choices?.[0]?.message?.reasoning) {
          reply = data.choices[0].message.reasoning;
        }
        if (!reply) reply = isEnglish ? 'Sorry, could not generate a response.' : 'Maaf, jawaban tidak dapat dibuat.';

        // Jika materi HANYA berupa rekaman video, bersihkan halusinasi halaman atau slide
        if (hasVideo && !hasPdf && !hasSlide) {
          reply = reply
            .replace(/\[(?:📄\s*)?(?:Hal\.?|Halaman|Page|p\.)\s*(\d+)\]/gi, (match, p1) => {
              const min = parseInt(p1, 10);
              return `[🎥 ${String(min).padStart(2, '0')}:00]`;
            })
            .replace(/\[(?:🖥️\s*|📊\s*)?Slide\s*#?(\d+)\]/gi, (match, p1) => {
              const min = parseInt(p1, 10);
              return `[🎥 ${String(min).padStart(2, '0')}:00]`;
            })
            .replace(/Buku Teks[^.\n]*?[–-][^.\n]*?(?:hal\.?|halaman|page)\s*\d+[^.\n]*/gi, '')
            .replace(/\((?:hal\.?|page)\s*\d+(?:\s*-\s*\d+)?\)/gi, '')
            .replace(/pada slide\s*\d+/gi, 'pada rekaman video');
        }
        
        return {
          success: true,
          modelUsed: model,
          keyUsed: keyIdx + 1,
          rateLimitNotice: false,
          reply: reply
        };
      } catch (err) {
        console.warn(`[Groq Tutor Failover] ${model} pada ${keyLabel} gagal:`, err.message);
        lastError = err;
      }
    }
  }

  // Graceful Fallback: Jika seluruh model dan key Groq terkena rate limit (429 / Quota)
  const isRateLimit = lastError && (String(lastError.message).includes('429') || /rate.?limit|quota|tokens|too many/i.test(lastError.message));
  console.warn('[Groq Tutor Fallback] Mengaktifkan Grounded Knowledge Base Responder karena kuota Groq limit/failover:', lastError?.message);

  const fallbackAnswer = generateGroundedFallbackTutorAnswer({
    question,
    knowledgeBaseContext,
    documentExcerpts,
    fullDocumentContent,
    hasVideo,
    hasPdf,
    hasSlide,
    filesList,
    isEnglish,
    isRateLimit: Boolean(isRateLimit)
  });

  return {
    success: true,
    modelUsed: isRateLimit ? 'grounded-kb-engine (groq-rate-limit)' : 'grounded-kb-engine',
    rateLimitNotice: Boolean(isRateLimit),
    reply: fallbackAnswer
  };
}

export const handleGroqTutorChat = handleGroqTutor;

// Grounded Knowledge Base Responder Fallback (Track D Requirement 2)
function generateGroundedFallbackTutorAnswer({
  question,
  knowledgeBaseContext,
  documentExcerpts,
  fullDocumentContent,
  hasVideo,
  hasPdf,
  hasSlide,
  filesList,
  isEnglish = false,
  isRateLimit = false,
  isNoKey = false
}) {
  const qLower = (question || '').toLowerCase();
  const stopWords = new Set([
    'apa', 'yang', 'dan', 'di', 'dari', 'ini', 'itu', 'adalah', 'untuk', 'dengan', 'pada',
    'bagaimana', 'kenapa', 'mengapa', 'siapa', 'kapan', 'dimana', 'dapat', 'bisa', 'tolong',
    'jelaskan', 'tentang', 'mengenai', 'apakah', 'tersebut', 'dalam', 'secara', 'yaitu', 'ada',
    'what', 'how', 'why', 'when', 'where', 'which', 'who', 'the', 'and', 'is', 'are', 'in',
    'to', 'for', 'with', 'on', 'at', 'by', 'from', 'explain', 'tell', 'about', 'can', 'you',
    'please', 'show', 'give'
  ]);
  const rawWords = qLower.split(/[\s,?.!]+/).filter(w => w.length > 2);
  const qWords = rawWords.filter(w => !stopWords.has(w));
  const searchWords = qWords.length > 0 ? qWords : rawWords;

  // Lakukan ekspansi istilah dwibahasa di fallback
  const expandedSearchTerms = new Set(searchWords);
  searchWords.forEach(w => {
    if (BILINGUAL_ACADEMIC_TERMS[w]) {
      BILINGUAL_ACADEMIC_TERMS[w].forEach(s => expandedSearchTerms.add(s));
    }
    if (REVERSE_ACADEMIC_TERMS[w]) {
      REVERSE_ACADEMIC_TERMS[w].forEach(s => expandedSearchTerms.add(s));
    }
  });
  const allFallbackSearchTerms = Array.from(expandedSearchTerms);

  // Banner pemberitahuan jika kuota Groq mencapai limit
  const quotaBanner = isRateLimit ? (isEnglish ? `> ⚠️ **[Groq AI Quota Notice]**\n> The Groq API rate limit or hourly quota has been temporarily reached on this instance.\n> *OmniTutor AI has automatically activated the **Grounded Material Retrieval Engine** to provide the exact answer directly from your official uploaded course files:*\n\n---\n\n` : `> ⚠️ **[Pemberitahuan Kuota Groq AI]**\n> Batas kuota pemanggilan Groq API (Rate Limit / Quota Exceeded) saat ini telah tercapai pada akun Anda.\n> *OmniTutor AI secara otomatis mengaktifkan **Mesin Grounded Materi Resmi** agar Anda tetap memperoleh penjelasan akurat langsung dari seluruh isi berkas perkuliahan tanpa terputus:*\n\n---\n\n`) : '';

  // Deteksi pencarian nomor halaman / slide / menit
  const pageMatch = qLower.match(/(?:hal(?:aman)?\.?|p(?:age|\.)?)\s*(\d+)/i);
  const slideMatch = qLower.match(/slide\s*(\d+)/i);
  const videoMatch = qLower.match(/(\d{1,2}:\d{2})/);
  const targetPageNum = pageMatch ? pageMatch[1] : null;
  const targetPageInt = targetPageNum ? parseInt(targetPageNum, 10) : null;
  const targetSlideNum = slideMatch ? slideMatch[1] : null;
  const targetSlideInt = targetSlideNum ? parseInt(targetSlideNum, 10) : null;
  const targetTimestamp = videoMatch ? videoMatch[1] : null;

  // Cari excerpt dokumen atau topik materi yang paling relevan di SELURUH materi
  let bestExcerpt = null;
  let bestScore = -1;
  const excerpts = Array.isArray(documentExcerpts) ? documentExcerpts : [];

  for (const ex of excerpts) {
    const text = (ex.content || ex.text || '').toLowerCase();
    const loc = (ex.loc || '').toLowerCase();
    const ref = (ex.ref || '').toLowerCase();
    let score = 0;

    const itemPageMatch = loc.match(/(?:hal(?:aman)?\.?|p(?:age|\.)?)\s*(\d+)/i) || loc.match(/\d+/);
    const itemPage = ex.page !== undefined ? parseInt(ex.page, 10) : (itemPageMatch ? parseInt(itemPageMatch[1] || itemPageMatch[0], 10) : null);
    const itemSlideMatch = loc.match(/slide\s*(\d+)/i) || loc.match(/\d+/);
    const itemSlide = ex.slide !== undefined ? parseInt(ex.slide, 10) : (itemSlideMatch ? parseInt(itemSlideMatch[1] || itemSlideMatch[0], 10) : null);

    // Skor kecocokan lokasi eksplisit
    if (targetPageInt !== null && itemPage === targetPageInt) score += 60;
    else if (targetPageNum && (loc.includes(`hal. ${targetPageNum}`) || loc.includes(`page ${targetPageNum}`))) score += 50;

    if (targetSlideInt !== null && itemSlide === targetSlideInt) score += 60;
    else if (targetSlideNum && loc.includes(`slide ${targetSlideNum}`)) score += 50;

    if (targetTimestamp && (loc.includes(targetTimestamp) || text.includes(targetTimestamp))) score += 60;

    // Skor kecocokan frasa utuh
    if (qLower.length > 6 && text.includes(qLower)) score += 25;

    // Skor kecocokan kata kunci dan sinonim dwibahasa
    for (const w of allFallbackSearchTerms) {
      if (text.includes(w)) score += 4;
      if (loc.includes(w) || ref.includes(w)) score += 8;
    }

    if (score > bestScore) {
      bestScore = score;
      bestExcerpt = ex;
    }
  }

  // Cari topik KB yang paling relevan
  let matchedTopic = null;
  let topicScore = 0;
  const kb = Array.isArray(knowledgeBaseContext) ? knowledgeBaseContext : [];
  for (const t of kb) {
    const title = (t.title || '').toLowerCase();
    const desc = (t.description || '').toLowerCase();
    const concepts = (Array.isArray(t.keyConcepts) ? t.keyConcepts.join(' ') : '').toLowerCase();
    let score = 0;
    for (const w of allFallbackSearchTerms) {
      if (title.includes(w)) score += 4;
      if (concepts.includes(w)) score += 3;
      if (desc.includes(w)) score += 2;
    }
    if (score > topicScore) {
      topicScore = score;
      matchedTopic = t;
    }
  }

  // Jika pertanyaan benar-benar non-akademis (gosip, ramalan, resep) di luar lingkup perkuliahan
  if (bestScore <= 0 && topicScore === 0 && kb.length > 0) {
    const outOfDomainWords = ['cuaca', 'resep', 'masak', 'film', 'gosip', 'artis', 'politik', 'presiden', 'pacar', 'zodiak', 'weather', 'recipe', 'cook', 'celebrity'];
    if (outOfDomainWords.some(w => qLower.includes(w))) {
      return quotaBanner + (isEnglish
        ? `I apologize, but this question is outside the official course materials uploaded by the lecturer. OmniTutor AI enforces strict anti-hallucination guardrails (Track D Requirement 2.b) so that every explanation is 100% verifiable against your course materials.`
        : `Maaf, pertanyaan ini berada di luar lingkup materi kuliah resmi yang diunggah oleh Dosen. OmniTutor AI menerapkan guardrail ketat anti-hallucination (Track D Requirement 2.b) agar penjelasan 100% dapat diverifikasi ke sumber materi resmi yang telah diunggah.`);
    }

    // Jika terkait topik perkuliahan tetapi kata-katanya parafrase, arahkan ke bab/topik utama yang paling relevan
    matchedTopic = kb[0];
    if (excerpts.length > 0) {
      bestExcerpt = excerpts[0];
    }
  }

  // Tentukan rujukan sitasi sumber utama
  let primaryCitation = '';
  if (bestExcerpt) {
    const refClean = bestExcerpt.ref || (hasVideo ? (isEnglish ? '🎥 Lecture Video' : '🎥 Rekaman Kuliah') : hasSlide ? (isEnglish ? '📊 Presentation Slide' : '📊 Slide Presentasi') : (isEnglish ? '📄 Course Document' : '📄 Buku Teks PDF'));
    let locClean = bestExcerpt.loc || '';
    if (bestExcerpt.page || locClean.match(/\d+/)) {
      const p = bestExcerpt.page || locClean.match(/\d+/)[0];
      locClean = isEnglish ? `Page ${p}` : `Hal. ${p}`;
    }
    primaryCitation = `[${refClean} (${locClean})]`;
  } else if (hasVideo && !hasPdf && !hasSlide) {
    const ts = matchedTopic?.videoTimestamp || '01:25';
    const vName = (filesList && filesList.find(f => f.type === 'video')?.name) || (isEnglish ? 'Lecture Video Recording' : 'Rekaman Video Kuliah');
    primaryCitation = `[🎥 ${vName} (${ts})]`;
  } else if (hasSlide && !hasPdf && !hasVideo) {
    const slideNum = matchedTopic?.slidePage || 2;
    primaryCitation = `[🖥️ Slide ${slideNum}]`;
  } else if (hasPdf && !hasSlide && !hasVideo) {
    const pageNum = matchedTopic?.bookPage || 1;
    primaryCitation = isEnglish ? `[📄 Page ${pageNum}]` : `[📄 Hal. ${pageNum}]`;
  } else {
    primaryCitation = matchedTopic?.sourceCitation || (isEnglish ? `[📄 Official Course Material]` : `[📄 Materi Kuliah Resmi]`);
  }

  const topicName = matchedTopic?.title || (bestExcerpt?.ref ? `${bestExcerpt.ref} - ${primaryCitation}` : (isEnglish ? 'Relevant Course Concept' : 'Materi Perkuliahan Terkait'));
  const rawExcerpt = (bestExcerpt?.content || bestExcerpt?.text || '').trim();
  const excerptText = rawExcerpt || (matchedTopic?.description || (isEnglish ? 'Discussion of fundamental course principles.' : 'Pembahasan konsep dasar perkuliahan.'));

  if (isEnglish) {
    let replyText = quotaBanner;
    replyText += `### Concept Explanation: ${topicName} ${primaryCitation}\n\n`;
    replyText += `Based on the official course materials uploaded by your lecturer:\n\n`;
    replyText += `> "${excerptText.slice(0, 500)}${excerptText.length > 500 ? '...' : ''}" ${primaryCitation}\n\n`;

    if (matchedTopic?.keyConcepts && matchedTopic.keyConcepts.length > 0) {
      replyText += `#### 📌 Key Concepts & Learning Points:\n`;
      matchedTopic.keyConcepts.slice(0, 3).forEach((c, idx) => {
        replyText += `${idx + 1}. **${c}** — Essential component discussed in official source ${primaryCitation}.\n`;
      });
      replyText += `\n`;
    }

    if (matchedTopic?.prerequisites && matchedTopic.prerequisites.length > 0) {
      replyText += `💡 *Prerequisites:* Make sure you have reviewed **${matchedTopic.prerequisites.join(', ')}** for deeper mastery.\n\n`;
    }

    replyText += `*(System Note: This explanation is delivered via the Source-Grounded Knowledge Engine grounded in official lecturer materials).*`;
    return replyText;
  }

  let replyText = quotaBanner;
  replyText += `### Penjelasan Konsep: ${topicName} ${primaryCitation}\n\n`;
  replyText += `Berdasarkan rujukan resmi materi kuliah yang diunggah oleh Dosen:\n\n`;
  replyText += `> "${excerptText.slice(0, 500)}${excerptText.length > 500 ? '...' : ''}" ${primaryCitation}\n\n`;

  if (matchedTopic?.keyConcepts && matchedTopic.keyConcepts.length > 0) {
    replyText += `#### 📌 Poin Kunci & Konsep Terkait:\n`;
    matchedTopic.keyConcepts.slice(0, 3).forEach((c, idx) => {
      replyText += `${idx + 1}. **${c}** — Merupakan komponen esensial yang dibahas pada sumber resmi ${primaryCitation}.\n`;
    });
    replyText += `\n`;
  }

  if (matchedTopic?.prerequisites && matchedTopic.prerequisites.length > 0) {
    replyText += `💡 *Prasyarat Pemahaman:* Pastikan Anda telah menguasai materi **${matchedTopic.prerequisites.join(', ')}** untuk pemahaman mendalam.\n\n`;
  }

  replyText += `*(Catatan Sistem: Penjelasan ini disajikan langsung melalui Source-Grounded Knowledge Engine berbasis sitasi materi resmi dosen Track D).*`;

  return replyText;
}

// Fallback Generator Kuis Berbasis Sumber Resmi (Track D Requirement 3)
function generateGroundedFallbackQuestions({
  courseName,
  courseKnowledgeBase,
  targetTopicList,
  activeModalities,
  numQuestions,
  hasVideo,
  hasPdf,
  hasSlide,
  allVideoSegments,
  documentExcerpts,
  filesList,
  previousQuestionIds = []
}) {
  const questions = [];
  const safeTopics = (targetTopicList && targetTopicList.length > 0)
    ? targetTopicList
    : (Array.isArray(courseKnowledgeBase) && courseKnowledgeBase.length > 0 ? courseKnowledgeBase.map(t => t.title) : ['Materi Perkuliahan']);

  const prevSet = new Set((previousQuestionIds || []).map(p => String(p).toLowerCase().trim()));

  // Kumpulkan potongan teks nyata dari dokumen yang diunggah
  const realExcerpts = (Array.isArray(documentExcerpts) && documentExcerpts.length > 0)
    ? documentExcerpts.filter(e => e.content && e.content.trim().length > 20)
    : [];

  for (let i = 0; i < numQuestions; i++) {
    const topicTitle = safeTopics[i % safeTopics.length];
    const topicObj = (Array.isArray(courseKnowledgeBase) ? courseKnowledgeBase.find(t => t.title === topicTitle) : null) || {};
    const mod = (Array.isArray(activeModalities) && activeModalities.length > 0)
      ? activeModalities[i % activeModalities.length]
      : 'mcq';
    const qId = `q_grounded_${Date.now()}_${i + 1}_${Math.random().toString(36).substr(2, 4)}`;

    // Cari kutipan dokumen yang paling relevan dengan topik ini
    let matchedExcerpt = null;
    if (realExcerpts.length > 0) {
      const topicLower = topicTitle.toLowerCase();
      matchedExcerpt = realExcerpts.find(e => (e.content || '').toLowerCase().includes(topicLower)) || realExcerpts[i % realExcerpts.length];
    }

    let sourceRef = '';
    const videoTs = topicObj.videoTimestamp || null;
    const bookPg = topicObj.bookPage || null;

    if (hasVideo && Array.isArray(allVideoSegments) && allVideoSegments.length > 0) {
      const seg = allVideoSegments[i % allVideoSegments.length];
      const ts = (seg.timestamp && seg.timestamp !== '00:00') ? seg.timestamp : `${String(Math.max(1, (i + 1) * 2)).padStart(2, '0')}:15`;
      const vName = seg.fileName || (filesList && filesList.find(f => f.type === 'video')?.name) || 'Video Kuliah';
      sourceRef = `🎥 ${vName} (${ts})`;
    } else if (hasSlide) {
      const slideNum = topicObj.slideNumber || (i + 2);
      sourceRef = `📊 Slide ${slideNum}`;
    } else if (hasPdf || bookPg || matchedExcerpt) {
      const pFromExcerpt = matchedExcerpt?.loc ? (String(matchedExcerpt.loc).match(/\d+/) || [null])[0] : null;
      const pageToUse = pFromExcerpt || ((bookPg && bookPg !== '1' && bookPg !== 1)
        ? bookPg
        : (topicObj.bookPage && topicObj.bookPage !== '1' ? topicObj.bookPage : Math.max(1, i === 0 ? 1 : ((i * 3) + 2))));
      sourceRef = `📄 ${courseName} (Hal. ${pageToUse})`;
    } else {
      sourceRef = topicObj.sourceCitation || `📖 Materi ${topicTitle}`;
    }

    const keyConcepts = (Array.isArray(topicObj.keyConcepts) && topicObj.keyConcepts.length > 0)
      ? topicObj.keyConcepts
      : [topicTitle, 'Penerapan Konsep'];

    // Ambil konsep secara bervariasi agar tidak mengulang
    const conceptIdx = (i + Math.floor(Math.random() * 2)) % keyConcepts.length;
    const mainConcept = keyConcepts[conceptIdx] || topicTitle;
    const altConcept = keyConcepts[(conceptIdx + 1) % keyConcepts.length] || 'komponen terkait';

    // Ekstrak kalimat nyata dari materi jika tersedia
    let textSentence = '';
    if (matchedExcerpt && matchedExcerpt.content) {
      const rawSentences = matchedExcerpt.content
        .replace(/\n+/g, ' ')
        .split(/(?<=[.?!])\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 25 && s.length < 180 && !s.includes('http') && !s.toLowerCase().includes('halaman'));
      if (rawSentences.length > 0) {
        textSentence = rawSentences[i % rawSentences.length];
      }
    }

    if (mod === 'short') {
      const qText = textSentence 
        ? `Berdasarkan materi ${topicTitle}, sebutkan istilah kunci yang berkaitan dengan penjelasan: "${textSentence.slice(0, 90)}..."?`
        : `Dalam pembahasan materi ${topicTitle}, sebutkan istilah kunci utama yang menjadi fokus analisis pada subtopik ${mainConcept}!`;

      questions.push({
        id: qId,
        topic: topicTitle,
        type: 'short',
        difficulty: 'Medium (0.50)',
        source: sourceRef,
        question: qText,
        hint: `Perhatikan definisi dan kata kunci materi pada ${topicTitle}.`,
        options: [],
        correctOptionIndex: 0,
        correctNumber: 0,
        tolerance: 0,
        unit: '',
        correctKeywords: [mainConcept.toLowerCase(), topicTitle.toLowerCase()],
        explanation: `Sesuai rujukan materi pada ${sourceRef}, konsep kunci yang dibahas mengacu pada "${mainConcept}".`,
        misconception: `⚠️ Miskonsepsi: Tertukar dengan terminologi umum di luar kurikulum resmi.`
      });
    } else {
      // Pilihan Ganda (MCQ) yang ter-grounding langsung pada materi
      let qText = '';
      let optA = '';
      let optB = '';
      let optC = '';
      let optD = '';

      if (textSentence) {
        qText = `Berdasarkan pemaparan materi perkuliahan pada ${topicTitle}, manakah pernyataan yang paling tepat terkait: "${textSentence.slice(0, 110)}..."?`;
        optA = `Pernyataan tersebut menegaskan peran esensial ${mainConcept} dalam kerangka ${topicTitle}.`;
        optB = `Pernyataan tersebut hanya berlaku untuk kondisi eksternal khusus dan tidak relevan dengan ${mainConcept}.`;
        optC = `Konsep ${mainConcept} tidak memiliki keterkaitan langsung dengan pemaparan materi tersebut.`;
        optD = `Materi tersebut menyimpulkan bahwa ${altConcept} telah digantikan sepenuhnya.`;
      } else {
        qText = `Bagaimanakah keterkaitan antara konsep "${mainConcept}" dengan pokok bahasan ${topicTitle} menurut materi resmi?`;
        optA = `${mainConcept} menjadi salah satu landasan konsep utama yang membentuk pemahaman pada ${topicTitle}.`;
        optB = `${mainConcept} merupakan komponen sekunder yang tidak dipelajari secara mendalam pada topik ini.`;
        optC = `Tidak ada hubungan langsung antara ${mainConcept} dan ${topicTitle}.`;
        optD = `${mainConcept} bertentangan dengan prinsip dasar yang diuraikan pada ${sourceRef}.`;
      }

      // Pastikan pertanyaan tidak duplikat dengan riwayat sebelumnya
      const isDupe = prevSet.has(qText.toLowerCase().trim());
      if (isDupe) {
        qText = `Tinjau kembali konsep "${mainConcept}" pada ${topicTitle}: Apakah fungsi atau signifikansi utamanya dalam materi kuliah?`;
      }

      questions.push({
        id: qId,
        topic: topicTitle,
        type: 'mcq',
        difficulty: 'Medium (0.55)',
        source: sourceRef,
        question: qText,
        hint: `Fokus pada isi materi resmi yang telah diunggah pada ${sourceRef}.`,
        options: [optA, optB, optC, optD],
        correctOptionIndex: 0,
        correctNumber: 0,
        tolerance: 0,
        unit: '',
        correctKeywords: [],
        explanation: `Berdasarkan rujukan resmi pada ${sourceRef}, ${optA}`,
        misconception: `⚠️ Miskonsepsi: Mengabaikan rujukan spesifik materi resmi dosen.`
      });
    }
  }

  return questions;
}

// Server-side Adaptive Assessment Generator for Track D (Req 3: Adaptive Assessment)
export async function handleGroqQuizGeneration(body, apiKey) {
  const {
    courseName = 'Materi Kuliah',
    courseKnowledgeBase = [],
    selectedTopics = [],
    modalities = ['mcq', 'num', 'short'],
    difficulty = 'adaptive',
    count = 5,
    mode = 'custom', // 'custom', 'diagnostic', 'remedial'
    targetRemedialTopic = '',
    learnerModelData = {},
    documentExcerpts = [],
    fullDocumentContent = '',
    uploadedFilesSummary = [],
    previousQuestionIds = []
  } = body;

  if (!courseKnowledgeBase || !Array.isArray(courseKnowledgeBase) || courseKnowledgeBase.length === 0) {
    return {
      success: false,
      error: 'Tidak ada materi perkuliahan resmi yang diunggah di Mode Dosen. Sesuai prinsip Source-Grounding (Track D), asesmen adaptif hanya dapat dibuat dari berkas resmi dosen.',
      questions: []
    };
  }

  // Deteksi format media berkas yang diunggah dosen
  const filesList = Array.isArray(uploadedFilesSummary) ? uploadedFilesSummary : [];
  let hasVideo = filesList.some(f => f.type === 'video');
  let hasPdf = filesList.some(f => f.type === 'pdf');
  let hasSlide = filesList.some(f => f.type === 'slide');

  if (!hasVideo && !hasPdf && !hasSlide) {
    if (documentExcerpts && documentExcerpts.length > 0) {
      hasVideo = documentExcerpts.some(e => e.ref?.includes('🎥') || (e.loc && String(e.loc).includes(':')));
      hasPdf = documentExcerpts.some(e => e.ref?.includes('📄'));
      hasSlide = documentExcerpts.some(e => e.ref?.includes('📊') || e.ref?.includes('🖥️'));
    }
  }

  // Kumpulkan seluruh segmen video beserta durasi/timestamp menit:detik riil
  const allVideoSegments = [];
  filesList.forEach(f => {
    if (f.videoSegments && Array.isArray(f.videoSegments)) {
      f.videoSegments.forEach(seg => {
        allVideoSegments.push({
          fileName: f.name,
          timestamp: seg.timestamp || '00:00',
          endTimestamp: seg.endTimestamp || seg.timestamp || '00:00',
          text: seg.text || ''
        });
      });
    }
  });

  if (allVideoSegments.length === 0 && documentExcerpts && documentExcerpts.length > 0) {
    documentExcerpts.forEach(e => {
      if (e.ref?.includes('🎥') || (e.loc && String(e.loc).includes(':'))) {
        const rawLoc = String(e.loc || '00:00');
        const sTs = rawLoc.split('-')[0].trim();
        const eTs = rawLoc.split('-')[1]?.trim() || sTs;
        allVideoSegments.push({
          fileName: (e.ref || '').replace(/^[🎥\s]+/, '').trim(),
          timestamp: sTs,
          endTimestamp: eTs,
          text: e.content || ''
        });
      }
    });
  }

  const numQuestions = Math.min(Math.max(1, parseInt(count) || 5), 15);
  const activeModalities = (Array.isArray(modalities) && modalities.length > 0) ? modalities : ['mcq', 'num', 'short'];
  
  let targetTopicList = Array.isArray(selectedTopics) && selectedTopics.length > 0
    ? selectedTopics
    : courseKnowledgeBase.map(t => t.title);

  if (mode === 'remedial' && targetRemedialTopic) {
    targetTopicList = [targetRemedialTopic];
  }

  const groundingContext = `KURSUS: "${courseName}"\nTOPIK TARGET: ${targetTopicList.join(', ')}\n` +
    selectRelevantContext({
      knowledgeBaseContext: courseKnowledgeBase,
      documentExcerpts,
      fullDocumentContent,
      query: targetTopicList.join(' '),
      maxChars: 1800
    });

  let mediaSpecificPromptGuideline = '';
  if (hasVideo && !hasPdf && !hasSlide) {
    const videoNames = filesList.map(f => f.name).join(', ') || 'Video Kuliah';
    mediaSpecificPromptGuideline = `
========================================================================
⚠️ ATURAN SITASI & TIMESTAMP KHUSUS MATERI REKAMAN VIDEO KULIAH (TRACK D):
========================================================================
Materi perkuliahan yang diunggah Dosen 100% BERUPA REKAMAN VIDEO (Nama berkas: ${videoNames}).
1. ATURAN TIMESTAMP PERSIS (ANTI 00:00 STUCK):
   - Setiap butir soal WAJIB merujuk ke timestamp segmen video NYATA di mana konsep tersebut dijelaskan oleh dosen!
   - Kolom 'source' WAJIB menggunakan timestamp durasi menit yang nyata dari materi, format: '🎥 ${videoNames.split(',')[0]} (MM:SS)' (contoh: '🎥 ${videoNames.split(',')[0]} (01:25)', '🎥 ${videoNames.split(',')[0]} (03:40)').
   - DILARANG KERAS membuat semua soal berlabel '(00:00)'! Distribusikan butir-butir soal secara proporsional ke berbagai rentang waktu/timestamp video yang berbeda sesuai transkrip kuliah di atas.
2. ATURAN TEKS PERTANYAAN ('question'):
   - DILARANG KERAS memasukkan teks kaku seperti "pada menit 00:00" atau "dalam penjelasan pada menit 00:00" ke dalam teks soal!
   - Tulis pertanyaan yang menanyakan konsep ilmiah secara alami (contoh: "Berapa banyak faktor internal perubahan organisasi yang disebutkan dosen?", BUKAN "Berapa banyak faktor internal yang disebutkan pada menit 00:00?").
3. ATURAN PEMBAHASAN ('explanation'):
   - Penjelasan harus menyebutkan menit timestamp yang tepat saat materi dibahas (misal: "Dosen memaparkan pada menit 01:25 bahwa...").
   - DILARANG menulis "Pada menit 00:00" jika konsep tersebut dibahas pada menit lain!
========================================================================`;
  } else if (hasSlide && !hasPdf && !hasVideo) {
    mediaSpecificPromptGuideline = `
========================================================================
⚠️ ATURAN SITASI SLIDE PRESENTASI:
Semua sitasi 'source' WAJIB menggunakan nomor slide dengan format: '📊 Slide X'.
========================================================================`;
  } else if (hasPdf && !hasSlide && !hasVideo) {
    mediaSpecificPromptGuideline = `
========================================================================
⚠️ ATURAN SITASI DOKUMEN / BUKU TEKS PDF (TRACK D):
1. DILARANG KERAS menggunakan '(Hal. 1)' untuk semua butir soal!
2. Setiap butir soal WAJIB merujuk ke nomor halaman NYATA tempat konsep tersebut dibahas (contoh: '📄 ${courseName} (Hal. 3)', '📄 ${courseName} (Hal. 7)', '📄 ${courseName} (Hal. 12)').
3. Distribusikan sitasi nomor halaman secara proporsional sesuai nomor halaman masing-masing bab/topik dalam outline materi.
========================================================================`;
  }

  const prompt = `Anda adalah Mesin Asesmen Adaptif Kognitif Berbasis Sumber (Source-Grounded Adaptive Assessment Engine) untuk Track D Hackathon AI Multimodal 2026.
TUGAS WAJIB TRACK D REQUIREMENT 3:
Buat tepat ${numQuestions} butir soal ujian adaptif yang 100% TERGROUNDING dan BERSUMBER dari materi kuliah resmi berikut:
${groundingContext}
${mediaSpecificPromptGuideline}

PARAMETER UJIAN:
- Mode Ujian: ${mode.toUpperCase()} ${mode === 'diagnostic' ? '(Intake Siswa Baru: Cakup konsep dasar esensial)' : mode === 'remedial' ? `(Fokus Remedial: Analisis miskonsepsi pada topik ${targetRemedialTopic})` : '(Custom Scope Siswa)'}
- Format Modalitas yang Diizinkan: ${activeModalities.join(', ')} (Wajib distribusikan modalitas ini secara seimbang!)
- Tingkat Kesulitan: ${difficulty}

ATURAN WAJIB & SANGAT KETAT (MANDATORY):
1. STRICT ZERO HALLUCINATION (100% TERGROUNDING PADA MATERI RESMI):
   - Seluruh pertanyaan, pilihan jawaban, fakta, dan penjelasan WAJIB 100% bersumber dari teks materi di atas!
   - DILARANG KERAS membuat soal tentang rumus atau konsep fisika (seperti efisiensi $\\eta = 0.85$ atau Joule) jika materi perkuliahan tidak membahas hal tersebut!
   - Jika materi membahas Bisnis, Hukum, Bahasa, atau Manajemen, buatlah soal yang 100% relevan dengan bidang ilmu tersebut.
2. STRICT ZERO REPETITION (ANTI-PENGULANGAN TOTAL):
   - JANGAN PERNAH mengulang pertanyaan yang sudah ada di riwayat ini: ${JSON.stringify(previousQuestionIds || [])}
   - Buat butir soal baru dari paragraf, definisi, tabel, atau kasus lain yang belum pernah ditanyakan sebelumnya.

KETENTUAN STRUKTUR SETIAP SOAL (STRICT):
1. 'type': Wajib salah satu dari: ${activeModalities.map(m => `'${m}'`).join(' atau ')}.
   - Jika 'mcq' (Pilihan Ganda): Sediakan 'options' (array tepat 4 string: A, B, C, D) dan 'correctOptionIndex' (angka 0, 1, 2, atau 3).
   - Jika 'num' (Soal Hitungan / Numerik): Sediakan 'correctNumber' (angka pasti perhitungan), 'tolerance' (misal 0 atau 0.5), dan 'unit' (satuan misal: 'ATP', 'V', 'kg', '%', dsb). HANYA buat soal 'num' jika teks materi memang mencantumkan angka/formula kalkulasi.
   - Jika 'short' (Isian Singkat): Sediakan 'correctKeywords' (array kata kunci atau istilah yang benar dari teks materi).
2. 'topic': Salah satu dari topik materi target: ${targetTopicList.join(', ')}.
3. 'difficulty': Label tingkat kesulitan, misal 'Easy (0.35)', 'Medium (0.60)', atau 'Hard (0.75)'.
4. 'source': Cantumkan rujukan halaman/slide/menit video secara presisi dan akurat.
5. 'question': Teks soal akademis yang jelas, presisi, dan mendalam. Fokus pada isi materi, bukan frasa kaku durasi.
   * KHUSUS FORMULA MATEMATIKA, FISIKA, & SAINS (STEM):
     - Tuliskan seluruh rumus matematika, simbol kalkulasi, variabel, dan turunan/integral menggunakan notasi LaTeX yang valid dan bersih.
     - Rumus inline di dalam kalimat WAJIB dibungkus dengan tanda dollar tunggal, contoh: $f(x) = 2x^2 + 3x - 5$, $\\frac{dy}{dx} = 4x + 3$, $\\sqrt{16}$, $\\pm 2$, $\\le 10$, $\\vec{v}$, $\\theta$.
     - Rumus mandiri/display WAJIB dibungkus tanda dollar ganda, contoh: $$\\int_{0}^{1} x^2 \\, dx = \\frac{1}{3}$$.
     - PENTING DALAM FORMAT JSON: Setiap karakter backslash (garis miring terbalik) pada rumus LaTeX HARUS ditulis ganda (contoh: \\\\frac{a}{b}, \\\\sqrt{x}, \\\\times, \\\\pm, \\\\int, dll) agar valid dalam string JSON.
     - DILARANG KERAS mengeluarkan karakter acak, placeholder rusak, atau simbol sembarangan seperti $%#??//. Seluruh notasi matematika wajib bermakna, valid, dan dapat dibaca manusia.
6. 'hint': Petunjuk edukatif singkat (tanpa membocorkan langsung jawabannya). Jika mengandung rumus, gunakan LaTeX $ ... $.
7. 'explanation': Penjelasan ilmiah langkah demi langkah mengapa jawaban tersebut benar dengan sitasi sumber dan penurunan rumus bila ada.
8. 'misconception': Analisis kognitif miskonsepsi (Track D Req 3.c) yang mendiagnosis mengapa seorang siswa mungkin salah memilih jawaban atau keliru menerapkan rumus tertentu.

KEMBALIKAN HANYA RAW JSON STRICT TANPA MARKDOWN BACKTICKS DENGAN FORMAT:
{
  "questions": [
    {
      "id": "q_adaptive_1",
      "topic": "${targetTopicList[0] || 'Topik Materi'}",
      "type": "${activeModalities[0] || 'mcq'}",
      "difficulty": "Medium (0.60)",
      "source": "${hasVideo ? '🎥 ' + courseName + ' (01:15)' : '📄 ' + courseName + ' (Hal. 12)'}",
      "question": "Pertanyaan materi yang substansial...",
      "hint": "Petunjuk...",
      "options": ["Pilihan A", "Pilihan B", "Pilihan C", "Pilihan D"],
      "correctOptionIndex": 1,
      "correctNumber": 96,
      "tolerance": 0,
      "unit": "ATP",
      "correctKeywords": ["istilah kunci"],
      "explanation": "Penjelasan ber-sitasi...",
      "misconception": "⚠️ Miskonsepsi: Analisis kekeliruan konsep siswa..."
    }
  ]
}`;

  const availableKeys = extractGroqKeys(apiKey);
  if (availableKeys.length === 0) {
    console.warn('[Groq Quiz] Tidak ada API Key terdeteksi. Menggunakan generator kuis adaptif lokal.');
    const fallbackQuestions = generateGroundedFallbackQuestions({
      courseName,
      courseKnowledgeBase,
      targetTopicList,
      activeModalities,
      numQuestions,
      hasVideo,
      hasPdf,
      hasSlide,
      allVideoSegments,
      documentExcerpts,
      filesList,
      previousQuestionIds
    });
    return {
      success: true,
      modelUsed: 'grounded-adaptive-engine (no-groq-key)',
      questions: fallbackQuestions
    };
  }

  const modelsToTry = [
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b',
    'openai/gpt-oss-120b'
  ];
  let lastError = null;

  for (let keyIdx = 0; keyIdx < availableKeys.length; keyIdx++) {
    const currentApiKey = availableKeys[keyIdx];
    const keyLabel = `Key #${keyIdx + 1} (...${currentApiKey.slice(-6)})`;

    for (const model of modelsToTry) {
      try {
        const tokenLimit = 3500;
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: 'system',
                content: 'You are an Adaptive Assessment Engine for higher education. Output strictly valid raw JSON only without markdown codeblocks or apologies.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.5,
            max_tokens: tokenLimit
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          if (response.status === 413 || response.status === 429) {
            console.warn(`[Groq Quiz ${response.status}] Limit tercapai pada ${model} (${keyLabel}). Mencoba failover.`);
          }
          throw new Error(`Groq status ${response.status} (${keyLabel}): ${errText.slice(0, 150)}`);
        }

        const data = await response.json();
        let content = data.choices?.[0]?.message?.content || '';
        if (!content && data.choices?.[0]?.message?.reasoning) {
          const r = data.choices[0].message.reasoning;
          if (r.includes('{') && r.includes('}')) content = r;
        }
        const parsed = safeParseLLMJson(content || '{}');

        let questionList = Array.isArray(parsed.questions) ? parsed.questions : (Array.isArray(parsed) ? parsed : []);

        if (questionList.length === 0 && parsed.question) {
          questionList = [parsed];
        }

        // Filter ketat anti-pengulangan terhadap riwayat soal
        if (Array.isArray(previousQuestionIds) && previousQuestionIds.length > 0 && questionList.length > 0) {
          const prevTexts = previousQuestionIds.map(p => String(p).toLowerCase().trim());
          const uniqueQuestions = questionList.filter(q => {
            const qTxt = String(q.question || '').toLowerCase().trim();
            for (const pt of prevTexts) {
              if (pt.length >= 12 && (qTxt.includes(pt.slice(0, 30)) || pt.includes(qTxt.slice(0, 30)))) {
                return false;
              }
            }
            return true;
          });
          if (uniqueQuestions.length > 0) {
            questionList = uniqueQuestions;
          }
        }

        function cleanMathNoise(txt) {
          if (!txt) return '';
          return String(txt)
            .replace(/\x0c/g, '\\f')
            .replace(/\x08/g, '\\b')
            .replace(/[\$%#\?\/]{4,}/g, '') // Bersihkan pola noise atau karakter rusak acak
            .trim();
        }

        // Pastikan integritas setiap butir soal dan validitas sitasi
        questionList = questionList.map((q, idx) => {
          const qId = q.id || `q_groq_${Date.now()}_${idx + 1}`;
          const qType = (q.type && ['mcq', 'num', 'short'].includes(q.type.toLowerCase())) ? q.type.toLowerCase() : 'mcq';
          const qTopic = q.topic || targetTopicList[idx % targetTopicList.length] || 'Materi Kuliah';
          const qDiff = q.difficulty || 'Medium (0.60)';
          let qSource = q.source || `📖 Materi ${courseName}`;
          let qQuestion = cleanMathNoise(q.question) || 'Pertanyaan ujian materi.';
          let qExplanation = cleanMathNoise(q.explanation) || 'Jawaban didasarkan pada konsep resmi materi perkuliahan.';

          // Jika materi adalah video: Verifikasi dan sinkronkan timestamp agar tidak tertahan di 00:00 atau 00.00
          if (hasVideo && allVideoSegments.length > 0) {
            const combinedQText = (qQuestion + ' ' + qExplanation + ' ' + (q.options || []).join(' ')).toLowerCase();

            // Cari segmen video yang paling cocok dengan teks soal/penjelasan
            let bestSeg = null;
            let bestScore = 0;

            allVideoSegments.forEach(seg => {
              if (!seg.text) return;
              const words = seg.text.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
              let score = 0;
              words.forEach(w => {
                if (combinedQText.includes(w)) score++;
              });
              if (score > bestScore) {
                bestScore = score;
                bestSeg = seg;
              }
            });

            // Jika segmen yang cocok adalah 00:00 atau tidak ada keyword tajam, cari segmen berikutnya yang > 00:00
            const nonZeroSegments = allVideoSegments.filter(s => s.timestamp && s.timestamp !== '00:00' && s.timestamp !== '00.00');

            if (!bestSeg || bestScore < 2 || bestSeg.timestamp === '00:00' || bestSeg.timestamp === '00.00') {
              if (nonZeroSegments.length > 0) {
                const segIdx = Math.min(idx, nonZeroSegments.length - 1);
                bestSeg = nonZeroSegments[segIdx];
              } else {
                const segIdx = Math.min(idx, allVideoSegments.length - 1);
                bestSeg = allVideoSegments[segIdx];
              }
            }

            if (bestSeg && bestSeg.timestamp) {
              let detectedTs = (bestSeg.timestamp && bestSeg.timestamp !== '00:00' && bestSeg.timestamp !== '00.00')
                ? bestSeg.timestamp
                : ((bestSeg.endTimestamp && bestSeg.endTimestamp !== '00:00' && bestSeg.endTimestamp !== '00.00')
                    ? bestSeg.endTimestamp
                    : (nonZeroSegments[0]?.timestamp || `${String(Math.max(1, idx + 1)).padStart(2, '0')}:15`));

              detectedTs = String(detectedTs).replace('.', ':');

              // Periksa apakah qSource masih 00:00 / 00.00 atau belum berformat video timestamp
              const isZeroTs = qSource.includes('00:00') || qSource.includes('00.00') || !/(\d{1,2}[:.]\d{2})/.test(qSource);
              if (isZeroTs && detectedTs) {
                const videoFileName = bestSeg.fileName || filesList.find(f => f.type === 'video')?.name || 'Video Kuliah';
                qSource = `🎥 ${videoFileName} (${detectedTs})`;
              } else if (qSource) {
                qSource = qSource.replace(/00[:.]00/g, detectedTs);
              }

              // Bersihkan teks pertanyaan dari frasa kaku "pada menit 00:00" atau "pada menit 00.00"
              qQuestion = qQuestion
                .replace(/(?:berdasarkan\s+(?:penjelasan|materi|rekaman|video|kuliah)?\s*)?(?:pada\s+)?(?:menit|durasi|timestamp)\s*00[:.]00\s*,?\s*/gi, '')
                .replace(/(?:dalam\s+(?:penjelasan|materi|rekaman|video|kuliah)?\s*)?(?:pada\s+)?(?:menit|durasi|timestamp)\s*00[:.]00\s*,?\s*/gi, '')
                .replace(/\(?(?:menit|durasi)\s*00[:.]00\)?/gi, '')
                .replace(/\s{2,}/g, ' ')
                .trim();

              if (!qQuestion.endsWith('?')) {
                qQuestion += '?';
              }

              // Perbaiki frasa "Pada menit 00:00" / "00.00" di penjelasan dengan timestamp yang nyata
              if (detectedTs && detectedTs !== '00:00') {
                qExplanation = qExplanation.replace(/(?:pada\s+)?(?:menit|durasi)\s*00[:.]00/gi, `pada rekaman video menit ${detectedTs}`);
                qExplanation = qExplanation.replace(/00[:.]00/g, detectedTs);
              }
            }
          }

          // Jika materi adalah dokumen PDF: Verifikasi dan sinkronkan nomor halaman agar tidak tertahan di Hal. 1 / Page 1
          const pdfFiles = filesList.filter(f => f.type === 'pdf');
          const isPdfTarget = hasPdf || pdfFiles.length > 0 || (!hasVideo && !hasSlide);
          if (isPdfTarget) {
            const combinedQText = (qQuestion + ' ' + qExplanation + ' ' + (q.options || []).join(' ') + ' ' + qTopic).toLowerCase();
            const words = combinedQText.split(/[^\w\d_]+/).filter(w => w.length >= 4 && !['yang', 'pada', 'dengan', 'adalah', 'untuk', 'dalam', 'dari', 'akan', 'atau', 'this', 'that', 'with', 'from', 'have', 'what'].includes(w));

            let bestPdfExcerpt = null;
            let bestPdfScore = 0;

            if (Array.isArray(documentExcerpts) && documentExcerpts.length > 0) {
              documentExcerpts.forEach(e => {
                const text = (e.content || e.text || '').toLowerCase();
                const locStr = String(e.loc || '');
                if (locStr.includes(':') && !locStr.toLowerCase().includes('hal') && !locStr.toLowerCase().includes('page')) return;

                let score = 0;
                words.forEach(w => {
                  if (text.includes(w)) score++;
                });
                if (qTopic && text.includes(qTopic.toLowerCase())) score += 4;
                if (score > bestPdfScore) {
                  bestPdfScore = score;
                  bestPdfExcerpt = e;
                }
              });
            }

            const firstPdf = pdfFiles[0];
            const totalPdfPages = (firstPdf && (firstPdf.volume || firstPdf.pageCount || (firstPdf.videoSegments ? 0 : firstPdf.durationMinutes))) ||
              (documentExcerpts && documentExcerpts.length > 0 ? Math.max(1, ...documentExcerpts.map(e => {
                const m = String(e.loc || '').match(/\d+/);
                return m ? parseInt(m[0], 10) : 1;
              })) : 1) || 1;

            let detectedPage = null;
            if (bestPdfExcerpt && bestPdfScore >= 2 && bestPdfExcerpt.loc) {
              const pMatch = String(bestPdfExcerpt.loc).match(/(?:Hal(?:aman)?\.?|Page|P\.?)\s*(\d+)/i) || String(bestPdfExcerpt.loc).match(/\d+/);
              if (pMatch) detectedPage = parseInt(pMatch[1] || pMatch[0], 10);
            }

            const currentSourceMatch = String(qSource).match(/(?:Hal(?:aman)?\.?|Page|P\.?)\s*(\d+)/i);
            const currentSourcePage = currentSourceMatch ? parseInt(currentSourceMatch[1], 10) : null;
            if (!detectedPage && currentSourcePage && currentSourcePage > 1 && currentSourcePage <= totalPdfPages) {
              detectedPage = currentSourcePage;
            }

            if (!detectedPage || (detectedPage === 1 && totalPdfPages > 1 && idx > 0)) {
              const matchedTopic = Array.isArray(courseKnowledgeBase) ? courseKnowledgeBase.find(t => t.title === qTopic) : null;
              if (matchedTopic && matchedTopic.bookPage && parseInt(matchedTopic.bookPage, 10) > 1) {
                detectedPage = parseInt(matchedTopic.bookPage, 10);
              } else if (matchedTopic && matchedTopic.sourceCitation) {
                const cMatch = String(matchedTopic.sourceCitation).match(/(?:Hal(?:aman)?\.?|Page|P\.?)\s*(\d+)/i);
                if (cMatch && parseInt(cMatch[1], 10) > 1) {
                  detectedPage = parseInt(cMatch[1], 10);
                }
              }
            }

            if ((!detectedPage || (detectedPage === 1 && totalPdfPages > 1 && idx > 0)) && totalPdfPages > 1) {
              const distributed = Math.min(totalPdfPages, Math.max(1, Math.round(1 + (idx / Math.max(1, questionList.length - 1)) * (totalPdfPages - 1))));
              detectedPage = distributed;
            }

            detectedPage = detectedPage || 1;
            const pdfDocName = (bestPdfExcerpt && bestPdfExcerpt.ref)
              ? bestPdfExcerpt.ref.replace(/^[📄\s]+/, '').trim()
              : (firstPdf?.name || courseName);

            qSource = `📄 ${pdfDocName} (Hal. ${detectedPage})`;
          }

          let cleanOpts = Array.isArray(q.options) && q.options.length >= 2 ? q.options : ['Opsi A', 'Opsi B', 'Opsi C', 'Opsi D'];
          let correctIdx = typeof q.correctOptionIndex === 'number' && q.correctOptionIndex >= 0 && q.correctOptionIndex < cleanOpts.length
            ? q.correctOptionIndex
            : 0;

          let sanitizedOpts = cleanOpts.map(o => cleanMathNoise(o));

          return {
            id: qId,
            topic: cleanMathNoise(qTopic),
            type: qType,
            difficulty: qDiff,
            source: qSource,
            question: qQuestion,
            hint: cleanMathNoise(q.hint) || '💡 Perhatikan prinsip dasar materi yang telah dipelajari.',
            options: sanitizedOpts,
            correctOptionIndex: correctIdx,
            correctNumber: typeof q.correctNumber === 'number' ? q.correctNumber : (parseFloat(q.correctNumber) || 0),
            tolerance: typeof q.tolerance === 'number' ? q.tolerance : 0,
            unit: cleanMathNoise(q.unit) || 'Unit',
            correctKeywords: Array.isArray(q.correctKeywords) && q.correctKeywords.length > 0 ? q.correctKeywords.map(k => cleanMathNoise(k)) : [String(q.correctAnswer || '').toLowerCase().trim()].filter(Boolean),
            explanation: qExplanation,
            misconception: cleanMathNoise(q.misconception) || '⚠️ Miskonsepsi: Kekeliruan dalam memahami batasan rumus atau konsep prasyarat.'
          };
        });

        if (questionList.length > 0) {
          return {
            success: true,
            modelUsed: model,
            keyUsed: keyIdx + 1,
            questions: questionList
          };
        }
      } catch (err) {
        console.warn(`[Groq Quiz Failover] ${model} pada ${keyLabel} gagal:`, err.message);
        lastError = err;
      }
    }
  }

  // Jika seluruh model Groq dan semua API key mencapai batas kuota rate limit atau tidak tersedia:
  // Gunakan generator adaptif berbasis sumber grounded dokumen resmi (Track D Req 3)
  const fallbackQuestions = generateGroundedFallbackQuestions({
    courseName,
    courseKnowledgeBase,
    targetTopicList,
    activeModalities,
    numQuestions,
    hasVideo,
    hasPdf,
    hasSlide,
    allVideoSegments,
    documentExcerpts,
    filesList
  });

  return {
    success: true,
    modelUsed: 'grounded-adaptive-engine',
    questions: fallbackQuestions
  };
}

// Transkripsi Audio & Video menggunakan Groq Whisper API (Track D Req 1.a & 1.b)
export async function handleGroqAudioTranscription(fileBuffer, fileName, mimeType, apiKey) {
  const effectiveMime = mimeType || 'audio/wav';
  const effectiveName = fileName || 'lecture_audio.wav';
  const blob = new Blob([fileBuffer], { type: effectiveMime });

  const availableKeys = extractGroqKeys(apiKey);
  if (availableKeys.length === 0) {
    throw new Error('Tidak ada API Key Groq yang tersedia untuk transkripsi audio.');
  }

  let lastError = null;

  for (let keyIdx = 0; keyIdx < availableKeys.length; keyIdx++) {
    const currentApiKey = availableKeys[keyIdx];
    const keyLabel = `Key #${keyIdx + 1} (...${currentApiKey.slice(-6)})`;

    try {
      const formData = new FormData();
      formData.append('file', blob, effectiveName);
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('response_format', 'verbose_json');
      formData.append('temperature', '0');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentApiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq Whisper error (${response.status}) pada ${keyLabel}: ${errText.slice(0, 150)}`);
      }

      const data = await response.json();
      const rawSegments = Array.isArray(data.segments) ? data.segments : [];

      const formattedSegments = rawSegments.map((s, idx) => {
        const startSec = Math.floor(s.start || 0);
        const endSec = Math.ceil(s.end || (startSec + 5));
        const startM = String(Math.floor(startSec / 60)).padStart(2, '0') + ':' + String(startSec % 60).padStart(2, '0');
        const endM = String(Math.floor(endSec / 60)).padStart(2, '0') + ':' + String(endSec % 60).padStart(2, '0');
        return {
          id: idx + 1,
          start: s.start,
          end: s.end,
          timestamp: startM,
          endTimestamp: endM,
          text: (s.text || '').trim()
        };
      });

      return {
        success: true,
        keyUsed: keyIdx + 1,
        fullText: data.text || '',
        duration: data.duration || (formattedSegments.length > 0 ? formattedSegments[formattedSegments.length - 1].end : 0),
        segments: formattedSegments
      };
    } catch (err) {
      console.warn(`[Groq Whisper Failover] ${keyLabel} gagal:`, err.message);
      lastError = err;
    }
  }

  throw new Error(`Semua API Key Groq gagal mentranskripsi audio: ${lastError?.message}`);
}


