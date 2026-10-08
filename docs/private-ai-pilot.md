# 비공개 AI 분석 시범 실행

이 스크립트는 공개 웹사이트에 연결되지 않은 **수동 실행 전용** 도구다. PDF 파일을 직접 읽지 않는다. 브라우저에서 추출한 페이지별 텍스트를 아래 JSON 배열로 준비해야 한다.

```json
[
  {"name":"sample.pdf","pages":[
    {"text":"첫 페이지에서 추출한 텍스트"},
    {"text":"두 번째 페이지에서 추출한 텍스트"}
  ]}
]
```

실제 당사자 개인정보나 사건기록을 쓰기 전에 전송 동의·보존정책·서비스 약관을 검토한다. 초기 시험에는 **가상 사건 텍스트**만 사용한다.

실행 환경은 Node.js 22 이상이며, 실제 API 키는 로컬 환경변수 `OPENAI_API_KEY`, 모델명은 `SQUIDLAW_AI_MODEL`에 설정한다. 두 값을 코드나 GitHub에 저장하지 않는다.

```sh
node --experimental-default-type=module pilot-analysis-cli.js mock-documents.json pilot-result.json --allow-ai-upload
```

`--allow-ai-upload`를 명시하지 않으면 실행되지 않는다. 이 명령을 실행하면 입력 페이지 텍스트가 외부 AI API로 전송되며 사용료가 발생할 수 있다. 최대 15개 배치를 순차적으로 처리한다. 결과는 새 파일에만 기록하며 기존 파일을 덮어쓰지 않는다.

출력의 `sourceReady`는 인용 문구가 입력 원문에 있는지에 관한 기술적 검사일 뿐, 사실관계나 법률적 타당성을 인증하지 않는다. **본 도구는 인증·결제·요청량 제한이 없는 공개 서비스로 연결하면 안 된다.**
