// ============================================================================
// lib/ai/local-embed — 로컬 의미 임베딩 (문자 n-gram 해싱)
//
// OpenAI 임베딩 키가 없을 때의 실동작 폴백이다. 이전 mock 은 텍스트 해시 시드
// 난수라 유사도가 무의미했다(무작위 벡터 → 코사인 ~0). 여기서는 문자 bi/tri-gram
// 을 해싱해 term-frequency 벡터를 만들고 L2 정규화한다 — 같은 어휘를 공유하는
// 문서일수록 코사인 유사도가 높아져, 실수집 기사끼리도 주제 기반으로 매칭된다.
//
// 한국어에 형태소 분석기 없이 동작해야 하므로 문자 n-gram 을 쓴다(어절 경계와
// 무관하게 부분 문자열 겹침을 잡는다). 실제 신경망 임베딩만큼 정교하진 않지만,
// 난수 대비 "의미 있는" 매칭을 만든다. 키가 오면 embed.ts 가 실제 임베딩으로 전환.
//
// 차원은 articles.embedding=vector(1536) 과 맞춘다(해시 버킷 1536개).
// ============================================================================

/** articles.embedding = vector(1536) 와 일치 */
const EMBEDDING_DIM = 1536;

/** 잡음 제거: 공백·문장부호를 정규화하고 소문자화 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, " ")
    .trim();
}

/** 문자열을 32비트 해시로 (FNV-1a 변형, 결정적) */
function hash32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 흔한 한국어 조사·접미(내용 신호가 약한 꼬리)를 어절 끝에서 벗겨 어간을 남긴다.
 * 형태소 분석기 없이 근사한다 — 완벽하지 않지만 "옥천군은/옥천군이/옥천군을"을
 * 같은 키로 모으는 정도면 주제 매칭에 충분하다.
 */
const PARTICLE_TAIL =
  /(으로써|으로서|에게서|이라고|으로|에서|에게|께서|이나|처럼|만큼|보다|까지|부터|마다|조차|은|는|이|가|을|를|의|에|도|와|과|나|로|든|만|여|해|한|할|하|된|될|들)$/;

function stem(word: string): string {
  let w = word;
  // 조사/접미를 최대 2회 벗긴다(중첩 조사 대응). 2자 미만은 그대로 둔다.
  for (let i = 0; i < 2; i += 1) {
    if (w.length <= 2) break;
    const next = w.replace(PARTICLE_TAIL, "");
    if (next === w || next.length < 2) break;
    w = next;
  }
  return w;
}

/**
 * 어절(내용어) 기반 term-frequency. 문자 n-gram 은 긴 한국어 텍스트에서 공통
 * 음절에 지배돼 모든 쌍의 유사도를 부풀리므로 쓰지 않는다. 대신 2자 이상 어절을
 * 어간화해 해시 버킷에 누적한다 — 같은 내용어를 공유할수록 유사도가 오른다.
 */
function ngramCounts(text: string): Map<number, number> {
  const norm = normalize(text);
  const counts = new Map<number, number>();

  for (const raw of norm.split(" ")) {
    // 숫자만/한 글자 토큰은 주제 신호가 약해 제외
    if (raw.length < 2 || /^\d+$/.test(raw)) continue;
    const token = stem(raw);
    if (token.length < 2) continue;
    const bucket = hash32(token) % EMBEDDING_DIM;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return counts;
}

/**
 * 로컬 의미 임베딩. L2 정규화된 1536차원 벡터를 반환한다(코사인=내적).
 * 같은 텍스트는 항상 같은 벡터(결정적).
 */
export function localEmbedding(text: string): number[] {
  const counts = ngramCounts(text);
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);

  let sumSq = 0;
  for (const [bucket, count] of counts) {
    // sublinear TF (자주 나오는 n-gram 의 지배 완화)
    const weight = 1 + Math.log(count);
    vector[bucket] = weight;
    sumSq += weight * weight;
  }

  // L2 정규화 — 빈 텍스트는 영벡터 그대로(유사도 0)
  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i += 1) {
      if (vector[i] !== 0) vector[i] = Number((vector[i] / norm).toFixed(6));
    }
  }
  return vector;
}
