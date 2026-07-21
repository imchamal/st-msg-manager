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
function createFloatingButton() {
    // 혹시 이미 버튼이 있다면 중복으로 만들지 않도록 방지해요.
    if (document.getElementById('smm-floating-button')) {
        return;
    }

    const button = document.createElement('div');
    button.id = 'smm-floating-button';
    button.title = '메시지 매니저';
    button.innerHTML = '<i class="fa-solid fa-list-check"></i>';

    button.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleRadialMenu();
    });

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

/** 특정 번호의 메시지로 화면을 부드럽게 스크롤해요. */
function scrollToMesId(mesId) {
    const target = document.querySelector(`#chat .mes[mesid="${mesId}"]`);
    if (!target) {
        toastr.warning('해당 번호의 메시지를 찾을 수 없어요.');
        return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    currentMesId = mesId;
}

function goFirst() { scrollToMesId(0); }
function goLast() { scrollToMesId(getLastMesId()); }
function goPrev() {
    const base = currentMesId === null ? getLastMesId() : currentMesId;
    scrollToMesId(Math.max(0, base - 1));
}
function goNext() {
    const base = currentMesId === null ? 0 : currentMesId;
    scrollToMesId(Math.min(getLastMesId(), base + 1));
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
        <button class="smm-scroll-btn" title="처음"><i class="fa-solid fa-angles-up"></i></button>
        <button class="smm-scroll-btn" title="이전"><i class="fa-solid fa-angle-up"></i></button>
        <input type="number" id="smm-go-input" placeholder="번호" min="0" />
        <button class="smm-scroll-btn" title="이동"><i class="fa-solid fa-arrow-right"></i></button>
        <button class="smm-scroll-btn" title="다음"><i class="fa-solid fa-angle-down"></i></button>
        <button class="smm-scroll-btn" title="끝"><i class="fa-solid fa-angles-down"></i></button>
        <button class="smm-scroll-btn smm-scroll-close" title="닫기"><i class="fa-solid fa-xmark"></i></button>
    `;

    const [firstBtn, prevBtn, goBtn, nextBtn, lastBtn, closeBtn] = bar.querySelectorAll('button');
    firstBtn.addEventListener('click', goFirst);
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
            onClick: () => toastr.info('메시지 목록 관리는 다음 단계에서 만들 거예요.') },
        { id: 'smm-radial-swipe', icon: 'fa-shuffle', title: '스와이프 관리', angle: 130,
            onClick: () => toastr.info('스와이프 관리는 다음 단계에서 만들 거예요.') },
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

/** 원형 메뉴(4개 아이콘)를 화면에 부채꼴 모양으로 펼쳐요. */
function createRadialMenu() {
    if (document.getElementById('smm-radial-menu')) {
        return;
    }

    const radius = 90; // 플로팅 버튼 중심에서 얼마나 멀리 떨어뜨릴지 (픽셀)
    const menu = document.createElement('div');
    menu.id = 'smm-radial-menu';

    getRadialMenuItems().forEach((item) => {
        const rad = (item.angle * Math.PI) / 180;
        const x = Math.cos(rad) * radius; // 왼쪽으로 이동할 거리
        const y = Math.sin(rad) * radius; // 위쪽으로 이동할 거리

        const btn = document.createElement('div');
        btn.className = 'smm-radial-item';
        btn.title = item.title;
        btn.innerHTML = `<i class="fa-solid ${item.icon}"></i>`;
        // 플로팅 버튼과 같은 기준(right/bottom)으로 위치를 계산해요.
        btn.style.right = `${20 - x}px`;
        btn.style.bottom = `${90 + y}px`;

        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            item.onClick();
        });

        menu.appendChild(btn);
    });

    document.body.appendChild(menu);

    // 메뉴 바깥을 클릭하면 자동으로 닫히게 해요.
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

let searchResults = []; // 검색어가 포함된 메시지 번호들
let searchIndex = -1;   // 지금 몇 번째 결과를 보고 있는지
let searchQuery = '';   // 마지막으로 검색한 단어

/** 정규식에서 특수문자로 취급되는 글자를 그대로 문자로 찾도록 이스케이프해요. */
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 채팅 전체에서 검색어가 포함된 메시지 번호를 찾아요. */
function findMatches(query) {
    const results = [];
    context.chat.forEach((mes, idx) => {
        if (mes.mes && mes.mes.toLowerCase().includes(query.toLowerCase())) {
            results.push(idx);
        }
    });
    return results;
}

/** 전에 하이라이트했던 메시지가 있으면 원래대로 되돌려요. */
function clearHighlight() {
    document.querySelectorAll('#chat .mes.smm-search-highlight')
        .forEach((el) => el.classList.remove('smm-search-highlight'));
}

/** 검색 결과 중 지금 순번(searchIndex)의 메시지로 이동하고 상태 표시를 갱신해요. */
function showCurrentSearchResult() {
    if (searchResults.length === 0) {
        return;
    }
    clearHighlight();
    const mesId = searchResults[searchIndex];
    scrollToMesId(mesId);

    const target = document.querySelector(`#chat .mes[mesid="${mesId}"]`);
    if (target) {
        target.classList.add('smm-search-highlight');
    }

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

    searchResults = findMatches(searchQuery);
    searchIndex = 0;

    const status = document.getElementById('smm-search-status');
    if (searchResults.length === 0) {
        clearHighlight();
        if (status) status.textContent = '0 / 0';
        toastr.info('검색 결과가 없어요.');
        return;
    }

    showCurrentSearchResult();
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

/** 실제로 텍스트를 바꾸고, 화면 갱신 + 저장까지 처리해요. */
async function performReplace(replaceText, applyToAll) {
    if (searchResults.length === 0) {
        toastr.warning('먼저 검색을 실행해주세요.');
        return;
    }

    const targetIds = applyToAll ? searchResults : [searchResults[searchIndex]];
    const regex = new RegExp(escapeRegExp(searchQuery), 'gi');

    targetIds.forEach((mesId) => {
        const mes = context.chat[mesId];
        if (!mes || !mes.mes) return;
        mes.mes = mes.mes.replace(regex, replaceText);
        updateMessageBlock(mesId, mes);
    });

    await saveChat();
    toastr.success(applyToAll
        ? `${targetIds.length}개 메시지를 모두 바꿨어요.`
        : '현재 메시지를 바꿨어요.');

    closeSearchBar();
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
