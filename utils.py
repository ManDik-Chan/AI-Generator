import time
import requests
import json
from typing import Tuple, Dict, List
from xiaohongshu_model import Xiaohongshu
from prompt_template import system_template_text, user_template_text
from langchain.memory import ConversationBufferMemory, ConversationSummaryMemory
from langchain.chains import ConversationChain
from langchain_openai import ChatOpenAI
import dashscope
from character_templates import CHARACTER_TEMPLATES
from api_clients import create_client
import io
from docx import Document
import PyPDF2
import streamlit as st


def create_copy_button(text: str, button_text: str = "📋 复制到剪贴板", key: str = None) -> None:
    """使用 Streamlit 原生组件创建复制按钮"""
    if key not in st.session_state:
        st.session_state[key] = False

    if st.button(button_text, key=f"btn_{key}", use_container_width=True):
        try:
            import pyperclip
            pyperclip.copy(text)
            st.session_state[key] = True
            st.success('✅ 已复制到剪贴板！', icon="✅")
        except ImportError:
            st.error('请先安装 pyperclip: pip install pyperclip')

def verify_api_key(model_type: str, api_key: str, max_retries: int = 2) -> Tuple[bool, str]:
    """验证API密钥是否有效，带重试机制"""
    print(f"开始验证密钥: model_type={model_type}")

    for attempt in range(max_retries):
        try:
            test_prompt = "Hi"
            print(f"创建客户端: 第{attempt + 1}次尝试")
            client = create_client(model_type, api_key, temperature=0.1)
            print("客户端创建成功，发送测试请求")
            response = client.chat(test_prompt)
            print(f"验证成功: {response[:100]}")
            return True, "API密钥验证成功"
        except Exception as e:
            print(f"验证错误: {str(e)}")
            if attempt == max_retries - 1:
                error_msg = str(e)
                if "auth" in error_msg.lower():
                    return False, "API密钥无效或已过期"
                elif "rate" in error_msg.lower():
                    return False, "API调用频率超限"
                else:
                    return False, f"验证失败: {error_msg}"
            time.sleep(1)
    return False, "验证超时，请稍后重试"


def generate_script(subject: str, video_length: float, creativity: float,
                    model_type: str, api_key: str, temperature: float = 0.2) -> Tuple[str, str]:
    """统一的脚本生成函数

    Args:
        subject: 视频主题
        video_length: 视频时长（分钟）
        creativity: 创意度
        model_type: 使用的模型类型
        api_key: API密钥
        temperature: 温度参数

    Returns:
        Tuple[str, str]: (标题, 脚本内容)
    """
    try:
        client = create_client(model_type, api_key, temperature)

        # 生成标题的模板
        title_template = f"请为'{subject}'这个主题的视频想一个吸引人的标题，直接输出标题即可，不要包含任何其他内容和解释。"

        # 生成脚本的模板
        script_template = f"""你是一位短视频内容创作专家。根据以下要求，为短视频创作一个详细的脚本。

主题：{subject}
时长：{video_length}分钟
创意度：{creativity}（0-1之间，越大创意性越强）

要求：
1. 整体内容长度要符合视频时长的要求
2. 脚本分为【开头】【中间】【结尾】三部分
3. 开头要吸引眼球，快速抓住观众注意力
4. 中间部分要有干货内容，注意节奏感
5. 结尾要有惊喜或意料之外的转折
6. 整体表达要轻松有趣，适合年轻人观看
7. 可以加入一些流行梗或者有趣的元素

请直接给出脚本内容，按照【开头】【中间】【结尾】的格式分段输出。"""

        # 生成标题
        title_response = client.chat(title_template)
        title = title_response.strip()

        # 生成脚本
        script_prompt = script_template
        script_response = client.chat(script_prompt)
        script = script_response.strip()

        return title, script

    except Exception as e:
        raise Exception(f"脚本生成失败: {str(e)}")


def generate_xiaohongshu_content(theme: str, model_type: str, api_key: str, temperature: float = 0.2) -> dict:
    """生成小红书内容的函数"""
    try:
        client = create_client(model_type, api_key, temperature)

        full_prompt = f"""{system_template_text}

{user_template_text.format(theme=theme)}

请直接按照以下格式输出内容，不要输出JSON格式：

[标题部分]
标题1
标题2
标题3
标题4
标题5

[正文部分]
正文内容...

[标签部分]
#标签1 #标签2 #标签3 ..."""

        # 获取响应
        response = client.chat(full_prompt)

        try:
            # 解析返回的内容
            sections = response.split('[')
            titles = []
            content = ""
            tags = []

            for section in sections:
                if '标题部分]' in section:
                    # 提取标题
                    titles_text = section.split(']')[1].strip()
                    titles = [t.strip() for t in titles_text.split('\n') if t.strip()]
                elif '正文部分]' in section:
                    # 提取正文
                    content = section.split(']')[1].strip()
                elif '标签部分]' in section:
                    # 提取标签
                    tags_text = section.split(']')[1].strip()
                    tags = [tag.strip('#') for tag in tags_text.split('#') if tag.strip()]

            # 验证数据
            if len(titles) < 5:
                raise ValueError("生成的标题数量不足5个")

            # 验证数据格式
            Xiaohongshu(
                titles=titles,
                content=content
            )

            # 返回结果
            return {
                "title": titles[0],
                "content": content,
                "tags": tags
            }

        except Exception as parse_error:
            raise ValueError(f"解析响应内容出错: {str(parse_error)}")

    except Exception as e:
        raise Exception(f"小红书内容生成失败: {str(e)}")


def generate_character_prompt(character_type: str, user_prompt: str) -> str:
    """根据选择的人设生成完整的提示词"""
    if character_type not in CHARACTER_TEMPLATES:
        return user_prompt

    character = CHARACTER_TEMPLATES[character_type]
    system_prompt = f"""
{character['personality']}

以下是一些你的回复示例，请参考其中的语气和风格：
{chr(10).join(character['example_responses'])}

请始终保持这个人设风格回复用户的消息。
现在用户说：{user_prompt}
"""
    return system_prompt


def get_chat_response(prompt: str, memory: ConversationBufferMemory,
                     model_type: str, api_key: str, character_type: str = None,
                     is_chat_feature: bool = False) -> str:
    """Generate chat response with memory support"""
    try:
        # 只有在聊天功能中才使用历史记忆和人设
        if is_chat_feature and memory:
            chat_history = ""
            if memory.chat_memory.messages:
                for message in memory.chat_memory.messages:
                    if hasattr(message, 'content') and message.content:
                        role = 'Human' if message.type == 'human' else 'Assistant'
                        chat_history += f"{role}: {message.content}\n"

            full_prompt = f"""
历史对话:
{chat_history}

当前问题: {prompt}

请基于以上历史对话回答当前问题。
"""
            # 只在聊天功能中应用人设
            if character_type:
                full_prompt = generate_character_prompt(character_type, full_prompt)
        else:
            # 其他功能直接使用原始prompt
            full_prompt = prompt

        print(f"Using model: {model_type}")

        # 根据不同模型获取响应
        response = ""
        if model_type == "qwen":
            response = _get_qwen_response(full_prompt, api_key)
        elif model_type == "chatgpt":
            response = _get_chatgpt_response(full_prompt, api_key)
        elif model_type == "claude":
            response = _get_claude_response(full_prompt, api_key)
        elif model_type == "glm":
            response = _get_glm_response(full_prompt, api_key)
        else:
            raise ValueError(f"不支持的模型类型: {model_type}")

        if not response or response.startswith("API"):
            print(f"Warning: Invalid response: {response}")
            return "抱歉，我暂时无法生成有效回复，请稍后再试。"

        # 只在聊天功能中保存对话记忆
        if is_chat_feature and memory:
            memory.chat_memory.add_user_message(prompt)
            memory.chat_memory.add_ai_message(response)

        return response

    except Exception as e:
        print(f"Error in get_chat_response: {str(e)}")
        return f"抱歉，处理请求时出现错误: {str(e)}"


def _get_qwen_response(prompt: str, api_key: str) -> str:
    """Get response from Qwen API with better error handling"""
    try:
        dashscope.api_key = api_key
        response = dashscope.Generation.call(
            model='qwen-max',
            messages=[{'role': 'user', 'content': prompt}],
            result_format='message'
        )
        print(f"Qwen API Response: {response}")  # 打印完整响应用于调试

        if response.status_code == 200:
            # 从新的响应格式中提取文本
            if response.output and response.output.choices:
                message = response.output.choices[0].get('message', {})
                response_text = message.get('content', '')
                if response_text:
                    return response_text

            print("Warning: Could not extract valid response from Qwen API output")
            return "抱歉，我没有得到有效的回复，请重试。"
        else:
            error_msg = f"API调用失败: {response.code}, {response.message}"
            print(f"Qwen API Error: {error_msg}")
            return f"API调用出错: {response.message}"
    except Exception as e:
        print(f"Error in Qwen API call: {str(e)}")
        return f"API调用异常: {str(e)}"


def _get_chatgpt_response(prompt: str, api_key: str) -> str:
    """Get response from ChatGPT API with better error handling"""
    try:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        data = {
            "model": "gpt-4",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7
        }
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=data,
            timeout=30  # 添加超时设置
        )
        response.raise_for_status()
        content = response.json()['choices'][0]['message']['content']
        if not content:
            print("Warning: Empty response from ChatGPT API")
            return "抱歉，我没有得到有效的回复，请重试。"
        return content
    except requests.exceptions.RequestException as e:
        print(f"ChatGPT API Request Error: {str(e)}")
        return f"API请求异常: {str(e)}"
    except Exception as e:
        print(f"Error in ChatGPT API call: {str(e)}")
        return f"API调用异常: {str(e)}"


def _get_claude_response(prompt: str, api_key: str) -> str:
    """Get response from Claude API with better error handling"""
    try:
        headers = {
            "anthropic-version": "2023-06-01",
            "x-api-key": api_key,
            "content-type": "application/json"
        }
        data = {
            "model": "claude-3-sonnet-20240229",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7
        }
        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=data,
            timeout=30
        )
        response.raise_for_status()
        content = response.json()['content'][0]['text']
        if not content:
            print("Warning: Empty response from Claude API")
            return "抱歉，我没有得到有效的回复，请重试。"
        return content
    except requests.exceptions.RequestException as e:
        print(f"Claude API Request Error: {str(e)}")
        return f"API请求异常: {str(e)}"
    except Exception as e:
        print(f"Error in Claude API call: {str(e)}")
        return f"API调用异常: {str(e)}"


def _get_glm_response(prompt: str, api_key: str, max_retries: int = 3, timeout: int = 60) -> str:
    """Get response from GLM API with improved error handling and retry mechanism

    Args:
        prompt: The prompt text to send
        api_key: GLM API key
        max_retries: Maximum number of retry attempts
        timeout: Timeout in seconds for the request

    Returns:
        Response text from the API
    """
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    import time

    # 创建一个带重试机制的session
    session = requests.Session()
    retries = Retry(
        total=max_retries,
        backoff_factor=1,  # 重试间隔会按1, 2, 4秒延长
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["POST"]
    )
    session.mount('https://', HTTPAdapter(max_retries=retries))

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    data = {
        "model": "glm-4-plus",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7
    }

    for attempt in range(max_retries):
        try:
            response = session.post(
                "https://open.bigmodel.cn/api/paas/v4/chat/completions",
                headers=headers,
                json=data,
                timeout=timeout  # 增加超时时间
            )

            response.raise_for_status()
            content = response.json()['choices'][0]['message']['content']

            if not content:
                print("Warning: Empty response from GLM API")
                return "抱歉，我没有得到有效的回复，请重试。"
            return content

        except requests.exceptions.Timeout:
            if attempt == max_retries - 1:
                print(f"GLM API final timeout after {max_retries} attempts")
                return f"API请求超时，请稍后重试。建议：\n1. 检查网络连接\n2. 尝试缩短输入内容\n3. 如果问题持续，可以选择其他AI模型"

            print(f"GLM API timeout on attempt {attempt + 1}, retrying...")
            time.sleep(2 ** attempt)  # 指数退避

        except requests.exceptions.RequestException as e:
            if attempt == max_retries - 1:
                print(f"GLM API Request Error: {str(e)}")
                return f"API请求异常: {str(e)}"

            print(f"GLM API error on attempt {attempt + 1}, retrying... Error: {str(e)}")
            time.sleep(2 ** attempt)

        except Exception as e:
            print(f"Error in GLM API call: {str(e)}")
            return f"API调用异常: {str(e)}"

    return "请求失败，请稍后重试"


def extract_text_from_pdf(file_content: bytes) -> str:
    """从PDF文件内容中提取文本"""
    try:
        pdf_file = io.BytesIO(file_content)
        pdf_reader = PyPDF2.PdfReader(pdf_file)

        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"

        return text
    except Exception as e:
        raise Exception(f"PDF文件读取失败: {str(e)}")


def extract_text_from_docx(file_content: bytes) -> str:
    """从DOCX文件内容中提取文本"""
    try:
        doc = Document(io.BytesIO(file_content))
        text = []
        for paragraph in doc.paragraphs:
            text.append(paragraph.text)
        return '\n'.join(text)
    except Exception as e:
        raise Exception(f"Word文件读取失败: {str(e)}")

def extract_text_from_image(image_content: bytes, api_key: str) -> str:
    """从图片中提取文字内容，使用GLM-4V-Flash模型"""
    import base64
    import requests

    try:
        # 将图片内容转换为base64
        image_base64 = base64.b64encode(image_content).decode('utf-8')

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        data = {
            "model": "glm-4v-flash",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "请提取图片中的文字内容，保持原有格式。"
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}"
                            }
                        }
                    ]
                }
            ]
        }

        response = requests.post(
            "https://open.bigmodel.cn/api/paas/v4/chat/completions",
            headers=headers,
            json=data,
            timeout=60
        )

        response.raise_for_status()
        extracted_text = response.json()['choices'][0]['message']['content']
        return extracted_text

    except Exception as e:
        raise Exception(f"图片文字提取失败: {str(e)}")


def analyze_legal_document(text: str, document_type: str, model_type: str, api_key: str) -> Dict:
    """分析法律文档内容"""
    from utils import _get_glm_response

    # 根据文档类型构建不同的提示词
    if document_type == "contract":
        prompt = f"""作为一个专业的法律顾问,请对以下合同进行全面分析:
{text}

请从以下几个方面进行详细分析:
1. 合同主要条款解析
2. 潜在风险点和法律漏洞
3. 模糊或有争议的条款
4. 对甲乙双方权责的评估
5. 具体的修改建议

请按以上顺序进行分析,并重点标注需要注意的内容。"""

    elif document_type == "legal_document":
        prompt = f"""作为一个专业的法律顾问,请对以下法律文书进行合法性分析:
{text}

请从以下几个方面进行详细分析:
1. 文书格式规范性
2. 法律依据的准确性
3. 程序合法性
4. 内容的完整性和准确性
5. 存在的问题和改进建议

请按以上顺序进行分析,并指出需要特别注意或修改的地方。"""

    # 获取AI分析结果
    try:
        analysis = _get_glm_response(prompt, api_key)

        return {
            'status': 'success',
            'analysis': analysis
        }
    except Exception as e:
        return {
            'status': 'error',
            'message': f"分析失败: {str(e)}"
        }


def get_legal_advice(case_description: str, question: str, model_type: str, api_key: str) -> Dict:
    """获取法律建议"""
    from utils import _get_glm_response

    prompt = f"""作为一个专业律师,请针对以下案例和问题提供专业的法律意见:

案例描述:
{case_description}

咨询问题:
{question}

请从以下方面提供详细分析和建议:
1. 法律定性分析
2. 相关法律法规
3. 可能的法律后果
4. 解决方案建议
5. 风险提示

请提供专业、客观的分析和建议。"""

    try:
        advice = _get_glm_response(prompt, api_key)

        return {
            'status': 'success',
            'advice': advice
        }
    except Exception as e:
        return {
            'status': 'error',
            'message': f"获取建议失败: {str(e)}"
        }


def analyze_legal_risk(scenario: str, model_type: str, api_key: str) -> Dict:
    """分析法律风险"""
    from utils import _get_glm_response

    prompt = f"""作为一个专业律师,请对以下情况进行法律风险分析:
{scenario}

请从以下几个方面进行分析:
1. 可能涉及的违法行为
2. 相关法律法规
3. 可能承担的法律责任
4. 潜在的处罚后果
5. 风险防范建议

请详细说明每个方面,并提供具体的法律依据。"""

    try:
        risk_analysis = _get_glm_response(prompt, api_key)

        return {
            'status': 'success',
            'analysis': risk_analysis
        }
    except Exception as e:
        return {
            'status': 'error',
            'message': f"风险分析失败: {str(e)}"
        }