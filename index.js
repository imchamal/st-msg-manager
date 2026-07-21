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
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
            onClick: () => toastr.info('검색/바꾸기는 다음 단계에서 만들 거예요.') },
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
