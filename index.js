// ============================================================
// 메시지 매니저 (Message Manager) - index.js
// ------------------------------------------------------------
// 이 파일은 확장프로그램의 "두뇌" 역할을 해요.
// 지금은 뼈대(스켈레톤)만 만들어둔 상태이고,
// 앞으로 기능을 하나씩 여기에 채워나갈 거예요.
// ============================================================

// 실리태번의 모든 핵심 기능(채팅 데이터, 저장 함수 등)은
// 이 getContext() 함수 하나로 꺼내 쓸 수 있어요.
const context = SillyTavern.getContext();
const {
    eventSource,
    event_types,
    extensionSettings,
    saveSettingsDebounced,
    Popup,
    POPUP_RESULT,
    executeSlashCommandsWithOptions,
    updateMessageBlock,
    saveChat,
} = context;

// 우리 확장을 구분하는 고유한 이름표예요.
// 다른 확장이랑 이름이 겹치면 안 되니까, 고유하게 지어요.
const MODULE_NAME = 'silly_message_manager';

// 확장이 처음 설치됐을 때 사용할 기본 설정값들이에요.
// (예: 나중에 "라이트 테마 강제 여부" 같은 옵션을 여기에 추가할 수 있어요)
const defaultSettings = Object.freeze({
    enabled: true,
});

/**
 * 설정값을 가져오거나, 없으면 기본값으로 새로 만들어주는 함수예요.
 * 확장이 업데이트돼서 새로운 옵션이 추가돼도,
 * 기존 사용자 설정을 안전하게 유지해주는 역할을 해요.
 */
function getSettings() {
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    // 새로 추가된 기본값 항목이 있으면 채워 넣어요.
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return extensionSettings[MODULE_NAME];
}

/**
 * 화면에 원형 플로팅 버튼을 만드는 함수예요.
 * 지금은 "설치가 잘 됐는지 확인"하는 용도로,
 * 버튼만 화면에 띄우고 누르면 콘솔에 로그만 찍도록 해뒀어요.
 * (원형 메뉴, 각 기능들은 다음 단계에서 하나씩 채울 거예요)
 */
/** localStorage에서 버튼 위치를 불러와요. */
function loadFabPosition() {
    try {
        const s = localStorage.getItem('smm-fab-pos');
        return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
}

/** 버튼 위치를 localStorage에 저장해요. */
function saveFabPosition(left, top) {
    try { localStorage.setItem('smm-fab-pos', JSON.stringify({ left, top })); } catch (e) {}
}

function createFloatingButton() {
    if (document.getElementById('smm-floating-button')) return;

    const button = document.createElement('div');
    button.id = 'smm-floating-button';
    button.title = '메시지 매니저';
    button.innerHTML = '<i class="fa-solid fa-list-check"></i>';

    // ---- 저장된 위치 복원 (화면 밖으로 나가지 않도록 클램프) ----
    const saved = loadFabPosition();
    if (saved) {
        const sz = 52;
        const l = Math.max(0, Math.min(saved.left, window.innerWidth  - sz));
        const t = Math.max(0, Math.min(saved.top,  window.innerHeight - sz));
        button.style.left   = l + 'px';
        button.style.top    = t + 'px';
        button.style.right  = 'auto';
        button.style.bottom = 'auto';
    }

    // ---- 드래그 (마우스 + 터치 공통) ----
    let isDragging  = false;
    let wasDragging = false;
    let dragStartX, dragStartY, dragStartLeft, dragStartTop;

    function initDrag(clientX, clientY) {
        const rect = button.getBoundingClientRect();
        dragStartX    = clientX;
        dragStartY    = clientY;
        dragStartLeft = rect.left;
        dragStartTop  = rect.top;
        // CSS 기준을 right/bottom → left/top 으로 전환
        button.style.left   = rect.left + 'px';
        button.style.top    = rect.top  + 'px';
        button.style.right  = 'auto';
        button.style.bottom = 'auto';
        isDragging = false;
    }

    function moveDrag(clientX, clientY) {
        const dx = clientX - dragStartX;
        const dy = clientY - dragStartY;
        if (!isDragging && Math.hypot(dx, dy) < 5) return; // 미세 떨림 무시
        isDragging = true;
        button.classList.add('smm-fab-dragging');
        closeRadialMenu();
        const sz   = button.offsetWidth;
        const newL = Math.max(0, Math.min(window.innerWidth  - sz, dragStartLeft + dx));
        const newT = Math.max(0, Math.min(window.innerHeight - sz, dragStartTop  + dy));
        button.style.left = newL + 'px';
        button.style.top  = newT + 'px';
    }

    function endDrag() {
        button.classList.remove('smm-fab-dragging');
        if (isDragging) {
            saveFabPosition(parseFloat(button.style.left), parseFloat(button.style.top));
            wasDragging = true;
        }
        isDragging = false;
        resetFade();
    }

    // 마우스 드래그
    button.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        initDrag(e.clientX, e.clientY);
        const onMove = (e) => moveDrag(e.clientX, e.clientY);
        const onUp   = ()  => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); endDrag(); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    });

    // 터치 드래그
    button.addEventListener('touchstart', (e) => {
        button.classList.remove('smm-faded');
        clearTimeout(button._fadeTimer);
        const t = e.touches[0];
        initDrag(t.clientX, t.clientY);
    }, { passive: true });

    button.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        moveDrag(t.clientX, t.clientY);
    }, { passive: true });

    button.addEventListener('touchend', () => endDrag());

    // 클릭 (드래그 직후는 무시)
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        if (wasDragging) { wasDragging = false; return; }
        toggleRadialMenu();
    });

    // ---- 자동 페이드 ----
    function resetFade() {
        button.classList.remove('smm-faded');
        clearTimeout(button._fadeTimer);
        button._fadeTimer = setTimeout(() => button.classList.add('smm-faded'), 4000);
    }
    button.addEventListener('mouseenter', () => { clearTimeout(button._fadeTimer); button.classList.remove('smm-faded'); });
    button.addEventListener('mouseleave', resetFade);
    resetFade(); // 처음 생성 시 타이머 시작

    document.body.appendChild(button);
}

// ============================================================
// 기능 1: mes_button에 빠른 삭제 아이콘 추가
// ------------------------------------------------------------
// 실리태번은 각 메시지(.mes) 안에 아이콘들이 모여있는
// .mes_buttons 라는 영역을 갖고 있어요.
// 여기에 휴지통 아이콘을 하나 끼워 넣을 거예요.
// ============================================================

/**
 * 실제로 메시지를 삭제하는 함수예요.
 * 실리태번이 이미 갖고 있는 "/cut (번호)" 명령어를 그대로 빌려서 실행해요.
 * (직접 채팅 데이터를 건드리는 것보다 훨씬 안전한 방법이에요)
 *
 * @param {string|number} mesId 삭제할 메시지의 번호 (0부터 시작)
 */
async function deleteMessageByIndex(mesId) {
    // 위험한 동작이니, 실행 전에 한 번 확인창을 띄워요.
    const result = await Popup.show.confirm(
        '메시지 삭제',
        '이 메시지를 삭제할까요? 되돌릴 수 없어요.',
    );

    if (result !== POPUP_RESULT.AFFIRMATIVE) {
        return; // 사용자가 취소를 눌렀으면 여기서 멈춰요.
    }

    try {
        // 실리태번의 /cut 명령어를 우리 코드에서 대신 실행시켜요.
        await executeSlashCommandsWithOptions(`/cut ${mesId}`, { showOutput: false });
        toastr.success('메시지를 삭제했어요.');
    } catch (error) {
        console.error(`[${MODULE_NAME}] 메시지 삭제 중 오류:`, error);
        toastr.error('메시지 삭제에 실패했어요. 콘솔을 확인해주세요.');
    }
}

/**
 * 메시지 하나(.mes 요소)에 빠른 삭제 아이콘을 끼워 넣는 함수예요.
 * @param {HTMLElement} mesElement 메시지를 감싸는 .mes 요소
 */
function injectDeleteButton(mesElement) {
    // 이미 아이콘이 붙어있다면 중복으로 넣지 않아요.
    if (mesElement.querySelector('.smm-quick-delete')) {
        return;
    }

    const buttonsContainer = mesElement.querySelector('.mes_buttons');
    if (!buttonsContainer) {
        return;
    }

    const deleteButton = document.createElement('div');
    // mes_button 클래스를 붙이면 기존 아이콘들과 똑같은 스타일(크기, 여백 등)을 그대로 물려받아요.
    deleteButton.className = 'mes_button smm-quick-delete fa-solid fa-trash-can';
    deleteButton.title = '빠른 삭제';

    deleteButton.addEventListener('click', async (event) => {
        // 클릭이 메시지 자체의 다른 클릭 이벤트로 번지지 않도록 막아요.
        event.stopPropagation();

        const mesId = mesElement.getAttribute('mesid');
        if (mesId === null) {
            console.warn(`[${MODULE_NAME}] mesid를 찾을 수 없어요.`);
            return;
        }

        await deleteMessageByIndex(mesId);
    });

    buttonsContainer.appendChild(deleteButton);
}

/**
 * 현재 화면에 있는 모든 메시지를 훑어서, 아직 삭제 아이콘이 없는 메시지에
 * 아이콘을 추가해주는 함수예요. 새 메시지가 그려질 때마다 이 함수를 다시 실행해요.
 */
function injectAllDeleteButtons() {
    document.querySelectorAll('#chat .mes').forEach(injectDeleteButton);
}

// ============================================================
// 기능 2: 원형 메뉴 + 이동(스크롤) 기능
// ------------------------------------------------------------
// 플로팅 버튼을 누르면 4개의 작은 원형 아이콘이 부채꼴로 펼쳐져요.
// 그중 "이동" 아이콘을 누르면, 처음/이전/번호입력/다음/끝
// 5개 버튼이 있는 미니 이동바가 떠요.
// ============================================================

// 지금 몇 번 메시지를 보고 있는지 기억해두는 변수예요.
// (이전/다음 버튼이 여기서부터 한 칸씩 움직여요)
let currentMesId = null;

function getLastMesId() {
    return context.chat.length - 1;
}

/** 특정 번호의 메시지로 화면을 부드럽게 스크롤해요.
 *  화면에 아직 안 그려진(=로딩 안 된) 메시지라면, 채팅 맨 위로 스크롤해서
 *  실리태번이 이전 메시지를 더 불러오게 만든 다음 다시 찾아봐요. */
/** 특정 번호의 메시지로 화면을 부드럽게 스크롤해요.
 *  화면에 아직 안 그려진(=로딩 안 된) 메시지라면, 실리태번의
 *  "Show more messages" 버튼을 직접 눌러서 이전 메시지를 불러온 다음
 *  다시 찾아봐요. (스크롤로는 더 안 불러와져서 버튼을 눌러야 해요.) */
async function scrollToMesId(mesId) {
    let target = document.querySelector(`#chat .mes[mesid="${mesId}"]`);
    let attempts = 0;

    while (!target && attempts < 50) {
        const showMoreBtn = document.getElementById('show_more_messages');
        if (!showMoreBtn) {
            // 버튼이 없다는 건 더 불러올 이전 메시지가 없다는 뜻이에요.
            break;
        }
        showMoreBtn.click();
        await new Promise((resolve) => setTimeout(resolve, 60));
        target = document.querySelector(`#chat .mes[mesid="${mesId}"]`);
        attempts += 1;
    }

    if (!target) {
        toastr.warning('해당 번호의 메시지를 찾을 수 없어요.');
        return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    currentMesId = mesId;
}

function goFirst() { scrollToMesId(0); }

/** 지금 채팅창에 실제로 그려져 있는(로딩된) 메시지 중 번호가 가장 작은 것을 찾아요. */
function getFirstLoadedMesId() {
    const first = document.querySelector('#chat .mes[mesid]');
    if (!first) return null;
    return Number(first.getAttribute('mesid'));
}

/** "처음으로"와 다르게, 추가로 이전 메시지를 불러오지 않고
 *  지금 로딩되어 있는 것 중 맨 앞 메시지로만 이동해요. */
function goFirstLoaded() {
    const firstLoadedId = getFirstLoadedMesId();
    if (firstLoadedId === null) {
        toastr.warning('불러와진 메시지가 없어요.');
        return;
    }
    // 이미 화면에 있는 메시지라, scrollToMesId 안의 "더 불러오기" 로직은 실행되지 않고 바로 이동해요.
    scrollToMesId(firstLoadedId);
}

function goLast() { scrollToMesId(getLastMesId()); }
function goPrev() {
    const base = currentMesId === null ? getLastMesId() : currentMesId;
    if (base <= 0) {
        toastr.info('첫 번째 메시지예요.');
        return;
    }
    scrollToMesId(base - 1);
}
function goNext() {
    const base = currentMesId === null ? 0 : currentMesId;
    if (base >= getLastMesId()) {
        toastr.info('마지막 메시지예요.');
        return;
    }
    scrollToMesId(base + 1);
}
function goToNumber(rawValue) {
    const n = parseInt(rawValue, 10);
    if (Number.isNaN(n) || n < 0 || n > getLastMesId()) {
        toastr.warning('올바른 메시지 번호를 입력해주세요.');
        return;
    }
    scrollToMesId(n);
}

/** 처음/이전/번호입력/다음/끝 버튼이 있는 미니 이동바를 만들어요. */
function createScrollBar() {
    if (document.getElementById('smm-scrollbar')) {
        return;
    }

    const bar = document.createElement('div');
    bar.id = 'smm-scrollbar';
    bar.innerHTML = `
        <button class="smm-scroll-btn" title="처음 (필요하면 이전 메시지를 불러와요)"><i class="fa-solid fa-angles-up"></i></button>
        <button class="smm-scroll-btn" title="로딩된 처음 (추가로 불러오지 않아요)"><i class="fa-solid fa-angle-up"></i></button>
        <button class="smm-scroll-btn" title="이전"><i class="fa-solid fa-angle-left"></i></button>
        <input type="number" id="smm-go-input" placeholder="번호" min="0" />
        <button class="smm-scroll-btn" title="이동"><i class="fa-solid fa-magnifying-glass"></i></button>
        <button class="smm-scroll-btn" title="다음"><i class="fa-solid fa-angle-right"></i></button>
        <button class="smm-scroll-btn" title="끝"><i class="fa-solid fa-angles-down"></i></button>
        <button class="smm-scroll-btn smm-scroll-close" title="닫기"><i class="fa-solid fa-xmark"></i></button>
    `;

    const [firstBtn, firstLoadedBtn, prevBtn, goBtn, nextBtn, lastBtn, closeBtn] = bar.querySelectorAll('button');
    firstBtn.addEventListener('click', goFirst);
    firstLoadedBtn.addEventListener('click', goFirstLoaded);
    prevBtn.addEventListener('click', goPrev);
    nextBtn.addEventListener('click', goNext);
    lastBtn.addEventListener('click', goLast);
    goBtn.addEventListener('click', () => goToNumber(bar.querySelector('#smm-go-input').value));
    closeBtn.addEventListener('click', () => bar.remove());

    document.body.appendChild(bar);
}

/** 원형 메뉴에 들어갈 4개 항목의 정의예요. (아이콘, 설명, 각도, 클릭시 동작) */
function getRadialMenuItems() {
    return [
        { id: 'smm-radial-list', icon: 'fa-list-ul', title: '메시지 목록 관리', angle: 100,
            onClick: () => { createListPanel(); closeRadialMenu(); } },
        { id: 'smm-radial-swipe', icon: 'fa-shuffle', title: '스와이프 관리', angle: 130,
            onClick: () => { openSwipeListPanel(); closeRadialMenu(); } },
        { id: 'smm-radial-search', icon: 'fa-magnifying-glass', title: '검색/바꾸기', angle: 160,
            onClick: () => { createSearchBar(); closeRadialMenu(); } },
        { id: 'smm-radial-move', icon: 'fa-arrows-up-down', title: '이동', angle: 190,
            onClick: () => { createScrollBar(); closeRadialMenu(); } },
    ];
}

function closeRadialMenu() {
    const menu = document.getElementById('smm-radial-menu');
    if (menu) {
        menu.remove();
    }
}

/** 원형 메뉴(4개 아이콘)를 화면에 부채꼴 모양으로 펼쳐요.
 *  버튼이 어디에 있어도 그 위치를 기준으로 아이템을 배치해요. */
function createRadialMenu() {
    if (document.getElementById('smm-radial-menu')) return;

    const button = document.getElementById('smm-floating-button');
    const rect   = button.getBoundingClientRect();
    const cx     = rect.left + rect.width  / 2; // 버튼 중심 x
    const cy     = rect.top  + rect.height / 2; // 버튼 중심 y

    const radius = 90;
    const menu   = document.createElement('div');
    menu.id      = 'smm-radial-menu';

    getRadialMenuItems().forEach((item, i) => {
        const rad = (item.angle * Math.PI) / 180;
        const x   = Math.cos(rad) * radius;
        const y   = Math.sin(rad) * radius;

        const btn = document.createElement('div');
        btn.className = 'smm-radial-item';
        btn.id        = item.id;
        btn.title     = item.title;
        btn.innerHTML = `<i class="fa-solid ${item.icon}"></i>`;

        // left/top 기준으로 버튼 중심에서 퍼져나가는 위치 계산
        // y는 화면에서 아래가 +이므로 반전(-y)해야 기존과 같은 방향이 나와요
        btn.style.left   = `${cx + x - 21}px`;
        btn.style.top    = `${cy - y - 21}px`;
        btn.style.right  = 'auto';
        btn.style.bottom = 'auto';
        btn.style.animationDelay = `${i * 35}ms`;

        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            item.onClick();
        });

        menu.appendChild(btn);
    });

    document.body.appendChild(menu);

    setTimeout(() => {
        document.addEventListener('click', closeRadialMenu, { once: true });
    }, 0);
}

function toggleRadialMenu() {
    if (document.getElementById('smm-radial-menu')) {
        closeRadialMenu();
    } else {
        createRadialMenu();
    }
}

// ============================================================
// 기능 3: 검색 / 바꾸기
// ------------------------------------------------------------
// 원형 메뉴의 "검색" 아이콘을 누르면 검색창이 뜨고,
// 입력한 단어가 들어있는 메시지들을 찾아서 하나씩 스크롤로 보여줘요.
// "바꾸기" 버튼을 누르면 지금 보고 있는 것만 바꿀지,
// 찾은 결과 전체를 한 번에 바꿀지 체크박스로 고를 수 있어요.
// ============================================================

let searchResults = []; // { mesId, el(span 요소) } 목록 - "메시지"가 아니라 "찾은 단어 하나하나"예요
let searchIndex = -1;   // 지금 몇 번째 단어를 보고 있는지
let searchQuery = '';   // 마지막으로 검색한 단어

/** 정규식에서 특수문자로 취급되는 글자를 그대로 문자로 찾도록 이스케이프해요. */
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 채팅 전체에서 검색어가 포함된 메시지 번호를 찾아요. (어떤 메시지를 뒤질지 후보를 좁히는 용도) */
function findMatches(query) {
    const results = [];
    context.chat.forEach((mes, idx) => {
        if (mes.mes && mes.mes.toLowerCase().includes(query.toLowerCase())) {
            results.push(idx);
        }
    });
    return results;
}

/**
 * 특정 메시지(mesId) 화면 안에서, 검색어와 일치하는 부분들을
 * <span class="smm-search-mark">로 감싸요. HTML 태그는 건드리지 않고
 * "실제로 보이는 글자(텍스트 노드)"만 찾아서 감싸기 때문에 안전해요.
 * 감싼 span 요소들을 순서대로 배열에 담아 돌려줘요.
 */
function highlightMatchesInMessage(mesId, query) {
    const mesElement = document.querySelector(`#chat .mes[mesid="${mesId}"]`);
    const textContainer = mesElement?.querySelector('.mes_text');
    if (!textContainer) {
        return [];
    }

    const regex = new RegExp(escapeRegExp(query), 'gi');
    const spans = [];

    const walker = document.createTreeWalker(textContainer, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
        textNodes.push(node);
    }

    textNodes.forEach((textNode) => {
        const text = textNode.textContent;
        regex.lastIndex = 0;
        if (!regex.test(text)) {
            return;
        }
        regex.lastIndex = 0;

        const frag = document.createDocumentFragment();
        let lastIndex = 0;
        let match;
        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }
            const mark = document.createElement('span');
            mark.className = 'smm-search-mark';
            mark.textContent = match[0];
            frag.appendChild(mark);
            spans.push(mark);
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) {
            frag.appendChild(document.createTextNode(text.slice(lastIndex)));
        }
        textNode.parentNode.replaceChild(frag, textNode);
    });

    return spans;
}

/** 감싸뒀던 <span> 하이라이트를 전부 원래 텍스트로 되돌려요. */
function clearHighlight() {
    document.querySelectorAll('#chat .smm-search-mark').forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) return;
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
    });
}

/**
 * 지금 검색어를 기준으로 하이라이트를 다시 그려요.
 * preserveIndex: 가능하면 이 순번을 유지해서 보여줘요.
 * (바꾸기 하나만 했을 때, 방금 바꾼 자리에 있던 "다음" 단어로 자연스럽게 이어지게 하기 위함이에요)
 */
function refreshSearchHighlights(preserveIndex) {
    clearHighlight();

    const matchingMesIds = findMatches(searchQuery);
    const newResults = [];
    matchingMesIds.forEach((mesId) => {
        const spans = highlightMatchesInMessage(mesId, searchQuery);
        spans.forEach((el) => newResults.push({ mesId, el }));
    });
    searchResults = newResults;

    const status = document.getElementById('smm-search-status');
    if (searchResults.length === 0) {
        searchIndex = -1;
        if (status) status.textContent = '0 / 0';
        toastr.info('더 이상 검색 결과가 없어요.');
        return;
    }

    searchIndex = Math.min(preserveIndex, searchResults.length - 1);
    showCurrentSearchResult();
}

/** 지금 순번(searchIndex)의 단어로 스크롤 + 색깔 구분(현재 위치만 다른 색)을 해줘요. */
function showCurrentSearchResult() {
    if (searchResults.length === 0) {
        return;
    }

    searchResults.forEach(({ el }) => el.classList.remove('smm-search-mark-current'));

    const { el, mesId } = searchResults[searchIndex];
    el.classList.add('smm-search-mark-current');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    currentMesId = mesId;

    const status = document.getElementById('smm-search-status');
    if (status) {
        status.textContent = `${searchIndex + 1} / ${searchResults.length}`;
    }
}

/** 검색어를 실행하는 함수예요. */
function runSearch(query) {
    searchQuery = query.trim();
    if (!searchQuery) {
        toastr.warning('검색어를 입력해주세요.');
        return;
    }

    refreshSearchHighlights(0);
}

function searchPrev() {
    if (searchResults.length === 0) return;
    searchIndex = (searchIndex - 1 + searchResults.length) % searchResults.length;
    showCurrentSearchResult();
}

function searchNext() {
    if (searchResults.length === 0) return;
    searchIndex = (searchIndex + 1) % searchResults.length;
    showCurrentSearchResult();
}

/** 문자열(text) 안에서 regex와 일치하는 것 중 n번째(0부터 시작)만 replaceText로 바꿔요. */
function replaceNthOccurrence(text, regex, n, replaceText) {
    let count = 0;
    return text.replace(regex, (match) => {
        const isTarget = count === n;
        count++;
        return isTarget ? replaceText : match;
    });
}

/** 실제로 텍스트를 바꾸고, 화면 갱신 + 저장까지 처리해요. */
async function performReplace(replaceText, applyToAll) {
    if (searchResults.length === 0) {
        toastr.warning('먼저 검색을 실행해주세요.');
        return;
    }

    const regex = new RegExp(escapeRegExp(searchQuery), 'gi');

    // 전체 일괄 바꾸기: 검색된 모든 메시지에서 전부 바꾸고 검색창을 닫아요.
    if (applyToAll) {
        const mesIds = [...new Set(searchResults.map((r) => r.mesId))];
        mesIds.forEach((mesId) => {
            const mes = context.chat[mesId];
            if (!mes || !mes.mes) return;
            mes.mes = mes.mes.replace(regex, replaceText);
            updateMessageBlock(mesId, mes);
        });
        await saveChat();
        toastr.success(`${mesIds.length}개 메시지에서 모두 바꿨어요.`);
        closeSearchBar();
        return;
    }

    // 하나씩 바꾸기: 지금 보고 있는 단어 1개만 바꾸고, 검색창은 그대로 열어둬요.
    const current = searchResults[searchIndex];
    const mes = context.chat[current.mesId];
    if (!mes || !mes.mes) return;

    // 같은 메시지 안에서 지금 단어가 몇 번째(0부터) occurrence인지 계산해요.
    const sameMessageResults = searchResults.filter((r) => r.mesId === current.mesId);
    const occurrenceIndex = sameMessageResults.indexOf(current);

    mes.mes = replaceNthOccurrence(mes.mes, regex, occurrenceIndex, replaceText);
    updateMessageBlock(current.mesId, mes);
    await saveChat();
    toastr.success('현재 단어를 바꿨어요.');

    // 방금 바꾼 자리를 기준으로 검색 결과를 다시 그려서, 다음 단어가 자연스럽게 이어서 보이게 해요.
    refreshSearchHighlights(searchIndex);
}

function closeSearchBar() {
    clearHighlight();
    const bar = document.getElementById('smm-searchbar');
    if (bar) bar.remove();
    searchResults = [];
    searchIndex = -1;
}

/** 검색창(입력 + 이전/다음 + 바꾸기)을 화면에 만들어요. */
function createSearchBar() {
    if (document.getElementById('smm-searchbar')) {
        return;
    }

    const bar = document.createElement('div');
    bar.id = 'smm-searchbar';
    bar.innerHTML = `
        <div class="smm-search-row">
            <input type="text" id="smm-search-input" placeholder="찾을 단어" />
            <button class="smm-scroll-btn" id="smm-search-go" title="검색"><i class="fa-solid fa-magnifying-glass"></i></button>
            <button class="smm-scroll-btn" id="smm-search-prev" title="이전 결과"><i class="fa-solid fa-angle-up"></i></button>
            <span id="smm-search-status">0 / 0</span>
            <button class="smm-scroll-btn" id="smm-search-next" title="다음 결과"><i class="fa-solid fa-angle-down"></i></button>
            <button class="smm-scroll-btn" id="smm-search-replace-toggle" title="바꾸기"><i class="fa-solid fa-repeat"></i></button>
            <button class="smm-scroll-btn smm-scroll-close" id="smm-search-close" title="닫기"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="smm-search-row" id="smm-search-replace-row" style="display:none;">
            <input type="text" id="smm-replace-input" placeholder="바꿀 단어" />
            <label class="smm-search-all-label">
                <input type="checkbox" id="smm-replace-all" /> 전체
            </label>
            <button class="smm-scroll-btn smm-danger-button" id="smm-replace-confirm" title="바꾸기 확인"><i class="fa-solid fa-check"></i></button>
        </div>
    `;

    document.body.appendChild(bar);

    const input = bar.querySelector('#smm-search-input');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') runSearch(input.value);
    });

    bar.querySelector('#smm-search-go').addEventListener('click', () => runSearch(input.value));
    bar.querySelector('#smm-search-prev').addEventListener('click', searchPrev);
    bar.querySelector('#smm-search-next').addEventListener('click', searchNext);
    bar.querySelector('#smm-search-close').addEventListener('click', closeSearchBar);

    bar.querySelector('#smm-search-replace-toggle').addEventListener('click', () => {
        const row = bar.querySelector('#smm-search-replace-row');
        row.style.display = row.style.display === 'none' ? 'flex' : 'none';
    });

    bar.querySelector('#smm-replace-confirm').addEventListener('click', () => {
        const replaceText = bar.querySelector('#smm-replace-input').value;
        const applyToAll = bar.querySelector('#smm-replace-all').checked;
        performReplace(replaceText, applyToAll);
    });

    input.focus();
}

// ============================================================
// 기능 4: 메시지 목록 관리 (체크박스로 선택 → 삭제/숨기기)
// ------------------------------------------------------------
// 원형 메뉴의 "목록" 아이콘을 누르면 화면 중앙에 리스트 창(모달)이 떠요.
// 체크박스로 여러 메시지를 고른 다음, 한 번에 삭제하거나
// 숨기기/숨김해제 할 수 있어요.
// ============================================================

let listSelectedIds = new Set(); // 지금 체크된 메시지 번호들

/** 메시지 텍스트에서 HTML 태그를 떼어내고, 한 줄 미리보기(최대 40자)를 만들어요. */
function getMessagePreview(mesText) {
    const temp = document.createElement('div');
    temp.innerHTML = mesText || '';
    const plain = (temp.textContent || '').replace(/\s+/g, ' ').trim();
    return plain.length > 40 ? `${plain.slice(0, 40)}...` : plain;
}

/** 리스트 안의 행(row)들을 현재 context.chat 기준으로 다시 그려요. */
function renderListRows() {
    const listBody = document.getElementById('smm-list-body');
    if (!listBody) return;

    listBody.innerHTML = '';

    context.chat.forEach((mes, idx) => {
        const row = document.createElement('div');
        row.className = 'smm-list-row';
        if (mes.is_system) {
            row.classList.add('smm-list-row-hidden');
        }

        const checked = listSelectedIds.has(idx) ? 'checked' : '';
        row.innerHTML = `
            <span class="smm-list-index">#${idx}</span>
            <span class="smm-list-preview">${getMessagePreview(mes.mes)}</span>
            <span class="smm-swipe-count-badge">${mes.swipes.length}개</span>
        `;

        row.querySelector('.smm-list-checkbox').addEventListener('change', (e) => {
            const id = Number(e.target.dataset.mesid);
            if (e.target.checked) {
                listSelectedIds.add(id);
            } else {
                listSelectedIds.delete(id);
            }
            updateSelectAllCheckbox();
        });

        listBody.appendChild(row);
    });

    updateSelectAllCheckbox();
}

/** 상단의 "전체 선택" 체크박스 상태를 지금 선택 개수에 맞춰 갱신해요. */
function updateSelectAllCheckbox() {
    const selectAll = document.getElementById('smm-list-select-all');
    if (!selectAll) return;
    const total = context.chat.length;
    selectAll.checked = total > 0 && listSelectedIds.size === total;
}

/** 전체 선택 체크박스를 눌렀을 때: 전체선택 ↔ 전체해제로 토글해요. */
function toggleSelectAllRows() {
    const total = context.chat.length;
    if (listSelectedIds.size === total) {
        listSelectedIds.clear();
    } else {
        listSelectedIds = new Set(context.chat.map((_, idx) => idx));
    }
    renderListRows();
}

/** 선택된 메시지들을 전부 삭제해요. (번호가 밀리지 않도록 큰 번호부터 지워요) */
async function deleteSelectedMessages() {
    if (listSelectedIds.size === 0) {
        toastr.warning('선택된 메시지가 없어요.');
        return;
    }

    const result = await Popup.show.confirm(
        '선택 삭제',
        `선택한 ${listSelectedIds.size}개 메시지를 삭제할까요? 되돌릴 수 없어요.`,
    );
    if (result !== POPUP_RESULT.AFFIRMATIVE) {
        return;
    }

    const idsDescending = [...listSelectedIds].sort((a, b) => b - a);
    for (const mesId of idsDescending) {
        await executeSlashCommandsWithOptions(`/cut ${mesId}`, { showOutput: false });
    }

    listSelectedIds.clear();
    toastr.success('선택한 메시지를 삭제했어요.');
    renderListRows();
}

/** 선택된 메시지들의 숨김 상태를 각자 반대로 뒤집어요. (보이던 건 숨기고, 숨겨진 건 다시 보이게) */
async function toggleHideSelectedMessages() {
    if (listSelectedIds.size === 0) {
        toastr.warning('선택된 메시지가 없어요.');
        return;
    }

    for (const mesId of listSelectedIds) {
        const mes = context.chat[mesId];
        if (!mes) continue;
        const command = mes.is_system ? '/unhide' : '/hide';
        await executeSlashCommandsWithOptions(`${command} ${mesId}`, { showOutput: false });
    }

    toastr.success('선택한 메시지의 숨김 상태를 바꿨어요.');
    renderListRows();
}

/** 리스트 패널(모달)을 닫아요. */
function closeListPanel() {
    const overlay = document.getElementById('smm-list-overlay');
    if (overlay) overlay.remove();
    listSelectedIds.clear();
}

/** 리스트 패널(모달)을 화면 중앙에 열어요. */
function createListPanel() {
    if (document.getElementById('smm-list-overlay')) {
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'smm-list-overlay';

    overlay.innerHTML = `
        <div id="smm-list-panel">
            <div id="smm-list-header">
                <input type="checkbox" id="smm-list-select-all" class="smm-list-checkbox" title="전체 선택" />
                <span id="smm-list-title">메시지 목록 관리</span>
                <button id="smm-list-close" title="닫기"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div id="smm-list-body"></div>
            <div id="smm-list-footer">
                <button id="smm-list-hide-btn" class="smm-scroll-btn" title="선택 숨기기/보이기">
                    <i class="fa-solid fa-ghost"></i> 숨기기/보이기
                </button>
                <button id="smm-list-delete-btn" class="smm-scroll-btn smm-danger-button" title="선택 삭제">
                    <i class="fa-solid fa-trash-can"></i> 삭제
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // 회색 배경(바깥) 클릭하면 닫혀요.
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeListPanel();
    });

    document.getElementById('smm-list-close').addEventListener('click', closeListPanel);
    document.getElementById('smm-list-select-all').addEventListener('click', toggleSelectAllRows);
    document.getElementById('smm-list-delete-btn').addEventListener('click', deleteSelectedMessages);
    document.getElementById('smm-list-hide-btn').addEventListener('click', toggleHideSelectedMessages);

    renderListRows();
}

// ============================================================
// 기능 5: 스와이프 관리
// ------------------------------------------------------------
// 캐릭터 메시지 중 "다시 생성하기"로 여러 버전(스와이프)이 쌓인
// 메시지만 모아서 보여주고, 버전별로 채택/삭제할 수 있어요.
//
// 주의: 실리태번 기본 명령어 /delswipe는 "채팅의 맨 마지막 메시지"에만
// 쓸 수 있어요. 우리는 과거의 아무 메시지나 다뤄야 하니까,
// 명령어 대신 context.chat 데이터를 직접 수정하고
// updateMessageBlock + saveChat으로 화면/저장을 반영하는 방식으로 만들었어요.
// ============================================================

let currentSwipeDetailMesId = null; // 지금 상세보기 중인 메시지 번호
let swipeExpandedSet = new Set();   // 상세보기에서 펼쳐진(전체 텍스트 보기) 버전 번호들

/** 스와이프가 2개 이상 있는 메시지만 골라서 [{idx, mes}, ...] 형태로 돌려줘요. */
function getSwipedMessages() {
    const result = [];
    context.chat.forEach((mes, idx) => {
        if (Array.isArray(mes.swipes) && mes.swipes.length > 1) {
            result.push({ idx, mes });
        }
    });
    return result;
}

// ---------- 1단계: 스와이프 있는 메시지 목록 ----------

function closeSwipeListPanel() {
    const overlay = document.getElementById('smm-swipe-list-overlay');
    if (overlay) overlay.remove();
}

function renderSwipeListRows() {
    const body = document.getElementById('smm-swipe-list-body');
    if (!body) return;

    body.innerHTML = '';
    const items = getSwipedMessages();

    if (items.length === 0) {
        body.innerHTML = '<div class="smm-swipe-empty">스와이프가 2개 이상인 메시지가 없어요.</div>';
        return;
    }

    items.forEach(({ idx, mes }) => {
        const row = document.createElement('div');
        row.className = 'smm-list-row smm-swipe-list-row';
        row.innerHTML = `
            <span class="smm-list-index">#${idx}</span>
            <span class="smm-list-name">${mes.name || ''}</span>
            <span class="smm-list-preview">${getMessagePreview(mes.mes)}</span>
            <span class="smm-swipe-count-badge">${mes.swipes.length}개</span>
        `;
        row.addEventListener('click', () => openSwipeDetailPanel(idx));
        body.appendChild(row);
    });
}

function openSwipeListPanel() {
    closeSwipeDetailPanel();
    if (document.getElementById('smm-swipe-list-overlay')) {
        renderSwipeListRows();
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'smm-swipe-list-overlay';
    overlay.innerHTML = `
        <div id="smm-swipe-list-panel">
            <div id="smm-list-header">
                <span id="smm-list-title">스와이프 관리</span>
                <button id="smm-swipe-list-close" title="닫기"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div id="smm-swipe-list-body"></div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSwipeListPanel();
    });
    document.getElementById('smm-swipe-list-close').addEventListener('click', closeSwipeListPanel);

    renderSwipeListRows();
}

// ---------- 2단계: 특정 메시지의 스와이프 버전 상세보기 ----------

function closeSwipeDetailPanel() {
    const overlay = document.getElementById('smm-swipe-detail-overlay');
    if (overlay) overlay.remove();
    currentSwipeDetailMesId = null;
    swipeExpandedSet.clear();
}

function backToSwipeList() {
    closeSwipeDetailPanel();
    openSwipeListPanel();
}

/** 특정 버전으로 전환(채택)해요. */
async function switchToSwipe(mesId, swipeIndex) {
    const mes = context.chat[mesId];
    if (!mes || !mes.swipes || !mes.swipes[swipeIndex]) return;

    mes.swipe_id = swipeIndex;
    mes.mes = mes.swipes[swipeIndex];
    updateMessageBlock(mesId, mes);
    await saveChat();

    toastr.success(`${swipeIndex + 1}번째 버전으로 전환했어요.`);
    renderSwipeDetailRows();
}

/** 특정 버전 하나를 삭제해요. */
async function deleteSwipe(mesId, swipeIndex) {
    const mes = context.chat[mesId];
    if (!mes || !mes.swipes || mes.swipes.length <= 1) {
        toastr.warning('마지막 남은 버전은 이 화면에서 지울 수 없어요.');
        return;
    }

    const result = await Popup.show.confirm(
        '스와이프 삭제',
        `${swipeIndex + 1}번째 버전을 삭제할까요? 되돌릴 수 없어요.`,
    );
    if (result !== POPUP_RESULT.AFFIRMATIVE) return;

    mes.swipes.splice(swipeIndex, 1);
    if (Array.isArray(mes.swipe_info)) {
        mes.swipe_info.splice(swipeIndex, 1);
    }

    if (swipeIndex < mes.swipe_id) {
        mes.swipe_id -= 1;
    } else if (swipeIndex === mes.swipe_id) {
        mes.swipe_id = Math.min(mes.swipe_id, mes.swipes.length - 1);
    }
    mes.mes = mes.swipes[mes.swipe_id];

    updateMessageBlock(mesId, mes);
    await saveChat();
    toastr.success('삭제했어요.');

    // 이제 스와이프가 1개만 남았다면 더 이상 "스와이프 있는 메시지"가 아니니, 목록으로 돌아가요.
    if (mes.swipes.length <= 1) {
        backToSwipeList();
    } else {
        renderSwipeDetailRows();
    }
}

/** 지금 채택된 버전 하나만 남기고 나머지는 전부 지워요. */
async function keepOnlyCurrentSwipe(mesId) {
    const mes = context.chat[mesId];
    if (!mes || !mes.swipes) return;

    const result = await Popup.show.confirm(
        '현재 버전만 남기기',
        '지금 보고 있는 버전 하나만 남기고 나머지 스와이프를 전부 삭제할까요? 되돌릴 수 없어요.',
    );
    if (result !== POPUP_RESULT.AFFIRMATIVE) return;

    mes.swipes = [mes.mes];
    mes.swipe_id = 0;
    if (Array.isArray(mes.swipe_info)) {
        mes.swipe_info = mes.swipe_info.length ? [mes.swipe_info[0]] : [];
    }

    updateMessageBlock(mesId, mes);
    await saveChat();
    toastr.success('현재 버전만 남겼어요.');

    backToSwipeList();
}

function toggleSwipeExpand(swipeIndex) {
    if (swipeExpandedSet.has(swipeIndex)) {
        swipeExpandedSet.delete(swipeIndex);
    } else {
        swipeExpandedSet.add(swipeIndex);
    }
    renderSwipeDetailRows();
}

function renderSwipeDetailRows() {
    const body = document.getElementById('smm-swipe-detail-body');
    if (!body || currentSwipeDetailMesId === null) return;

    const mes = context.chat[currentSwipeDetailMesId];
    if (!mes || !mes.swipes) return;

    body.innerHTML = '';

mes.swipes.forEach((swipeText, i) => {
        const isCurrent = i === mes.swipe_id;
        const isExpanded = swipeExpandedSet.has(i);
        // 펼쳤을 때 첫 문단이 들여쓰기돼 보이는 문제 방지: 맨 앞 공백/줄바꿈만 제거해요.
        const fullText = (swipeText || '').replace(/^\s+/, '');

        const row = document.createElement('div');
        row.className = 'smm-swipe-detail-row';
        if (isCurrent) row.classList.add('smm-swipe-detail-row-current');

        row.innerHTML = `
            <div class="smm-swipe-detail-top">
                <span class="smm-swipe-version-badge">버전 ${i + 1}</span>
                <span class="smm-swipe-detail-preview">${isExpanded ? '' : getMessagePreview(swipeText)}</span>                <button class="smm-swipe-adopt-btn ${isCurrent ? 'smm-swipe-adopt-current' : ''}" ${isCurrent ? 'disabled' : ''}>
                    ${isCurrent ? '현재' : '채택'}
                </button>
                <button class="smm-swipe-delete-icon-btn" title="삭제">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
                <button class="smm-swipe-expand-btn" title="펼치기/접기">
                    <i class="fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                </button>
            </div>
            ${isExpanded ? `<div class="smm-swipe-detail-text-expanded">${fullText}</div>` : ''}
        `;

        row.querySelector('.smm-swipe-expand-btn').addEventListener('click', () => toggleSwipeExpand(i));
        if (!isCurrent) {
            row.querySelector('.smm-swipe-adopt-btn').addEventListener('click', () => switchToSwipe(currentSwipeDetailMesId, i));
        }
        row.querySelector('.smm-swipe-delete-icon-btn').addEventListener('click', () => deleteSwipe(currentSwipeDetailMesId, i));

        body.appendChild(row);
    });
}

function openSwipeDetailPanel(mesId) {
    closeSwipeListPanel();
    currentSwipeDetailMesId = mesId;
    swipeExpandedSet.clear();

    const mes = context.chat[mesId];

    const overlay = document.createElement('div');
    overlay.id = 'smm-swipe-detail-overlay';
    overlay.innerHTML = `
        <div id="smm-swipe-detail-panel">
            <div id="smm-list-header">
                <button id="smm-swipe-back" title="목록으로"><i class="fa-solid fa-arrow-left"></i></button>
                <span id="smm-list-title">#${mesId} 스와이프 (${mes.swipes.length}개)</span>
                <button id="smm-swipe-detail-close" title="닫기"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div id="smm-swipe-detail-body"></div>
            <div id="smm-swipe-detail-footer">
                <button id="smm-swipe-keep-only-btn" class="smm-scroll-btn smm-danger-button">
                    <i class="fa-solid fa-broom"></i> 현재 버전만 남기고 삭제
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSwipeDetailPanel();
    });
    document.getElementById('smm-swipe-back').addEventListener('click', backToSwipeList);
    document.getElementById('smm-swipe-detail-close').addEventListener('click', closeSwipeDetailPanel);
    document.getElementById('smm-swipe-keep-only-btn').addEventListener('click', () => keepOnlyCurrentSwipe(mesId));

    renderSwipeDetailRows();
}

// ============================================================
// 기능 6: 드래그 텍스트 빠른 수정
// ------------------------------------------------------------
// 메시지 안의 텍스트를 드래그(선택)하면, 선택 영역 "아래"에
// 연필 아이콘 하나짜리 작은 툴바가 떠요. (나중에 다른 아이콘도
// 여기 옆에 추가할 수 있게 만들어뒀어요)
// 연필을 누르면 2단계로, 선택했던 텍스트가 담긴 입력창이 뜨고
// 확인을 누르면 검색/바꾸기 때와 똑같은 방식(updateMessageBlock으로
// 화면을 다시 그리고, saveChat()으로 저장)으로 반영돼요.
// ============================================================

let dragEditRange = null;       // 선택했던 범위를 복제해서 저장해둬요 (버튼 클릭 후에도 쓰려고)
let dragEditMesId = null;       // 어떤 메시지 안에서 선택했는지
let dragEditSelectedText = '';  // 선택했던 원본 텍스트 그대로
let dragEditPopupOpen = false;  // 2단계 입력창이 열려있는 동안은 새 선택 감지를 멈춰요
let dragSelectionDebounceTimer = null;

function closeDragEditToolbar() {
    document.getElementById('smm-drag-edit-toolbar')?.remove();
}

function closeDragEditPopup() {
    document.getElementById('smm-drag-edit-popup')?.remove();
}

function closeDragEditAll() {
    closeDragEditToolbar();
    closeDragEditPopup();
    dragEditPopupOpen = false;
    dragEditRange = null;
    dragEditMesId = null;
    dragEditSelectedText = '';
    window.getSelection()?.removeAllRanges();
}

/** container 안에서 targetNode/targetOffset이 "글자 몇 번째"인지 계산해요. */
function getAbsoluteOffsetInContainer(container, targetNode, targetOffset) {
    let offset = 0;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
        if (node === targetNode) {
            return offset + targetOffset;
        }
        offset += node.textContent.length;
    }
    return -1;
}

/** 선택한 텍스트가, 화면에 보이는 메시지 전체 텍스트 중 몇 번째(0부터)로 등장하는지 계산해요.
 *  (검색/바꾸기의 "occurrence" 방식과 동일한 원리예요) */
function computeOccurrenceIndex(mesId, selectedText, range) {
    const mesEl = document.querySelector(`#chat .mes[mesid="${mesId}"]`);
    const container = mesEl?.querySelector('.mes_text');
    if (!container) return -1;

    const startOffset = getAbsoluteOffsetInContainer(container, range.startContainer, range.startOffset);
    if (startOffset === -1) return -1;

    const before = container.textContent.slice(0, startOffset);
    const regex = new RegExp(escapeRegExp(selectedText), 'g');
    let count = 0;
    while (regex.exec(before) !== null) count++;
    return count;
}

/** 화면 좌표(rect) 바로 아래쪽에 요소를 배치해요. 화면 밖으로 나가면 살짝 안쪽으로 보정해요. */
function positionBelowRect(el, rect) {
    const gap = 8;
    el.style.position = 'fixed';
    el.style.top = `${rect.bottom + gap}px`;
    el.style.left = `${rect.left + rect.width / 2}px`;
    el.style.transform = 'translateX(-50%)';

    requestAnimationFrame(() => {
        const box = el.getBoundingClientRect();
        if (box.left < 4) {
            el.style.left = `${4 + box.width / 2}px`;
        } else if (box.right > window.innerWidth - 4) {
            el.style.left = `${window.innerWidth - 4 - box.width / 2}px`;
        }
        if (box.bottom > window.innerHeight - 4) {
            // 아래쪽에 공간이 없으면 이번만 선택 영역 "위"로 띄워요.
            el.style.top = `${rect.top - box.height - gap}px`;
        }
    });
}

/** 1단계: 선택 영역 아래에 연필 아이콘 툴바를 띄워요. */
function showDragEditToolbar(rect) {
    closeDragEditToolbar();

    const bar = document.createElement('div');
    bar.id = 'smm-drag-edit-toolbar';
    bar.innerHTML = `
        <button class="smm-drag-edit-icon-btn" id="smm-drag-edit-pencil" title="선택한 부분 수정">
            <i class="fa-solid fa-pen"></i>
        </button>
    `;
    document.body.appendChild(bar);
    positionBelowRect(bar, rect);

    document.getElementById('smm-drag-edit-pencil').addEventListener('click', () => {
        openDragEditPopup(rect);
    });
}

/** 2단계: 선택했던 텍스트를 고칠 수 있는 입력창을 띄워요. */
function openDragEditPopup(rect) {
    closeDragEditToolbar();
    closeDragEditPopup();
    dragEditPopupOpen = true;

    const popup = document.createElement('div');
    popup.id = 'smm-drag-edit-popup';
    popup.innerHTML = `
        <textarea id="smm-drag-edit-input"></textarea>
        <div class="smm-drag-edit-actions">
            <button class="smm-scroll-btn" id="smm-drag-edit-cancel" title="취소"><i class="fa-solid fa-xmark"></i></button>
            <button class="smm-scroll-btn" id="smm-drag-edit-confirm" title="확인"><i class="fa-solid fa-check"></i></button>
        </div>
    `;
    document.body.appendChild(popup);
    positionBelowRect(popup, rect);

    const input = popup.querySelector('#smm-drag-edit-input');
    input.value = dragEditSelectedText;
    input.focus({ preventScroll: true });  // 자동 스크롤 방지
    input.select();

    popup.querySelector('#smm-drag-edit-cancel').addEventListener('click', closeDragEditAll);
    popup.querySelector('#smm-drag-edit-confirm').addEventListener('click', () => {
        performDragEdit(input.value);
    });
}

/** 실제로 원본 메시지(context.chat) 텍스트를 바꾸고, 화면 갱신 + 저장까지 처리해요. */
async function performDragEdit(newText) {
    if (dragEditMesId === null || !dragEditRange || !dragEditSelectedText) {
        closeDragEditAll();
        return;
    }

    const mes = context.chat[dragEditMesId];
    if (!mes || typeof mes.mes !== 'string') {
        closeDragEditAll();
        return;
    }

    const occurrenceIndex = computeOccurrenceIndex(dragEditMesId, dragEditSelectedText, dragEditRange);
    const regex = new RegExp(escapeRegExp(dragEditSelectedText), 'g');
    const matchCount = (mes.mes.match(regex) || []).length;

    // 마크다운 서식(**, * 등) 때문에 화면 텍스트와 원본 텍스트가 다르면
    // 정확히 같은 자리를 못 찾을 수 있어요. 이럴 땐 억지로 바꾸지 않고 알려줘요.
    if (occurrenceIndex === -1 || occurrenceIndex >= matchCount) {
        toastr.warning('마크다운 서식 등의 이유로 원본에서 같은 부분을 정확히 찾지 못했어요.');
        closeDragEditAll();
        return;
    }

    mes.mes = replaceNthOccurrence(mes.mes, regex, occurrenceIndex, newText);
    updateMessageBlock(dragEditMesId, mes);
    await saveChat();
    toastr.success('수정했어요.');
    closeDragEditAll();
}

/** 문서 안의 텍스트 선택 상태가 바뀔 때마다(드래그 도중 포함) 조금 있다가 한 번만 확인해요. */
function scheduleSelectionCheck() {
    if (dragEditPopupOpen) return;
    clearTimeout(dragSelectionDebounceTimer);
    dragSelectionDebounceTimer = setTimeout(checkTextSelection, 150);
}

function checkTextSelection() {
    if (dragEditPopupOpen) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        closeDragEditToolbar();
        return;
    }

    const selectedText = selection.toString();
    if (!selectedText.trim()) {
        closeDragEditToolbar();
        return;
    }

    const range = selection.getRangeAt(0);
    const anchorNode = range.commonAncestorContainer;
    const anchorEl = anchorNode.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode;

    const mesEl = anchorEl?.closest?.('.mes[mesid]');
    const textContainer = anchorEl?.closest?.('.mes_text');
    if (!mesEl || !textContainer) {
        closeDragEditToolbar();
        return;
    }

    dragEditRange = range.cloneRange();
    dragEditMesId = Number(mesEl.getAttribute('mesid'));
    dragEditSelectedText = selectedText;

    showDragEditToolbar(range.getBoundingClientRect());
}

document.addEventListener('selectionchange', scheduleSelectionCheck);

// 채팅을 스크롤하거나(캡처 단계라 #chat 내부 스크롤도 잡혀요), 툴바/입력창 바깥을 클릭하면 닫아요.
document.addEventListener('scroll', () => {
    if (dragEditPopupOpen) return;  // 입력창이 열려있는 동안은 스크롤로 닫지 않아요
    closeDragEditAll();
}, true);
document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#smm-drag-edit-toolbar, #smm-drag-edit-popup')) {
        closeDragEditAll();
    }
});

/**
 * 확장이 실제로 시작될 때 실행되는 함수예요.
 * 여기서 설정을 불러오고, 화면에 버튼을 만들어요.
 */
function init() {
    getSettings();
    createFloatingButton();

    // 확장이 켜지는 시점에 이미 화면에 그려져 있는 메시지들에도 아이콘을 붙여줘요.
    injectAllDeleteButtons();

    console.log(`[${MODULE_NAME}] 확장프로그램이 로드되었습니다.`);
}

// APP_READY: 실리태번 화면이 완전히 다 뜬 다음에 실행돼요.
// 우리 확장의 UI를 만드는 작업은 보통 이 타이밍에 하는 게 안전해요.
eventSource.on(event_types.APP_READY, init);

// 메시지가 새로 그려질 때마다(유저 메시지, 캐릭터 메시지, 채팅 전환 등)
// 삭제 아이콘을 다시 확인/추가해줘요.
eventSource.on(event_types.USER_MESSAGE_RENDERED, injectAllDeleteButtons);
eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, injectAllDeleteButtons);
eventSource.on(event_types.CHAT_CHANGED, injectAllDeleteButtons);
