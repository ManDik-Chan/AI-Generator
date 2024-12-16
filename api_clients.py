
import requests
import time
from typing import Dict, Any, Optional, Tuple, Union
import logging
from abc import ABC, abstractmethod

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class APIError(Exception):
    """API 错误基类"""
    pass


class AuthenticationError(APIError):
    """认证错误"""
    pass


class RateLimitError(APIError):
    """频率限制错误"""
    pass


class NetworkError(APIError):
    """网络错误"""
    pass


class BaseAPIClient(ABC):
    """API 客户端基类"""

    def __init__(
            self,
            api_key: str,
            base_url: str,
            model: str,
            temperature: float = 0.2,
            max_retries: int = 3,
            timeout: int = 30,
            backoff_factor: float = 0.5
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.model = model
        self.temperature = temperature
        self.max_retries = max_retries
        self.timeout = timeout
        self.backoff_factor = backoff_factor
        self.session = self._create_session()

    def _create_session(self) -> requests.Session:
        """创建复用的会话对象"""
        session = requests.Session()
        session.headers.update(self.get_headers())
        return session

    @abstractmethod
    def get_headers(self) -> Dict[str, str]:
        """返回 API 请求头"""
        pass

    @abstractmethod
    def process_response(self, response: requests.Response) -> str:
        """处理 API 响应"""
        pass

    def _handle_error_response(self, response: requests.Response) -> None:
        """处理错误响应"""
        error_msg = f"API request failed with status {response.status_code}"
        try:
            error_data = response.json()
            if isinstance(error_data, dict):
                error_msg = error_data.get('error', {}).get('message', error_msg)
        except:
            error_msg = response.text or error_msg

        if response.status_code == 401:
            raise AuthenticationError("API密钥无效或已过期")
        elif response.status_code == 429:
            raise RateLimitError("API调用频率超限")
        else:
            raise APIError(f"API请求失败: {error_msg}")

    def make_request(
            self,
            endpoint: str,
            payload: Dict[str, Any]
    ) -> str:
        """发送 API 请求并处理重试"""
        url = f"{self.base_url}/{endpoint}"
        last_exception = None

        for attempt in range(self.max_retries):
            try:
                logger.info(f"Attempting API request to {url} (attempt {attempt + 1}/{self.max_retries})")
                response = self.session.post(
                    url,
                    json=payload,
                    timeout=self.timeout
                )

                if response.ok:
                    return self.process_response(response)
                else:
                    self._handle_error_response(response)

            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
                last_exception = NetworkError(f"网络错误: {str(e)}")
                logger.warning(f"Network error on attempt {attempt + 1}: {str(e)}")
            except (AuthenticationError, RateLimitError) as e:
                # 这些错误不需要重试
                raise
            except Exception as e:
                last_exception = e
                logger.error(f"Unexpected error on attempt {attempt + 1}: {str(e)}")

            if attempt < self.max_retries - 1:
                sleep_time = self.backoff_factor * (2 ** attempt)
                logger.info(f"Retrying in {sleep_time} seconds...")
                time.sleep(sleep_time)

        raise last_exception or APIError("所有重试尝试均失败")

    def chat(
            self,
            prompt: str,
            temperature: Optional[float] = None,
            **kwargs
    ) -> str:
        """发送聊天请求"""
        try:
            payload = self.prepare_chat_payload(prompt, temperature, **kwargs)
            return self.make_request("chat/completions", payload)
        except Exception as e:
            logger.error(f"Chat request failed: {str(e)}")
            raise

    @abstractmethod
    def prepare_chat_payload(
            self,
            prompt: str,
            temperature: Optional[float] = None,
            **kwargs
    ) -> Dict[str, Any]:
        """准备聊天请求的参数"""
        pass


class QwenClient(BaseAPIClient):
    """通义千问 API 客户端"""

    def __init__(self, api_key: str, temperature: float = 0.2):
        super().__init__(
            api_key=api_key,
            # 修改为正确的 API 端点
            base_url="https://dashscope.aliyuncs.com/api/v1",
            model="qwen-max",
            temperature=temperature
        )

    def get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def process_response(self, response: requests.Response) -> str:
        data = response.json()
        return data['output']['text']

    def prepare_chat_payload(
            self,
            prompt: str,
            temperature: Optional[float] = None,
            **kwargs
    ) -> Dict[str, Any]:
        payload = {
            "model": self.model,
            "input": {
                "messages": [{"role": "user", "content": prompt}]
            }
        }
        if temperature is not None:
            payload["parameters"] = {"temperature": temperature}
        return payload

    def make_request(
            self,
            endpoint: str,
            payload: Dict[str, Any]
    ) -> str:
        """重写请求方法以适配通义千问的特殊端点"""
        url = f"{self.base_url}/services/aigc/text-generation/generation"
        last_exception = None

        for attempt in range(self.max_retries):
            try:
                logger.info(f"Attempting API request to {url} (attempt {attempt + 1}/{self.max_retries})")
                response = self.session.post(
                    url,
                    json=payload,
                    timeout=self.timeout
                )

                if response.ok:
                    return self.process_response(response)
                else:
                    self._handle_error_response(response)

            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
                last_exception = NetworkError(f"网络错误: {str(e)}")
                logger.warning(f"Network error on attempt {attempt + 1}: {str(e)}")
            except (AuthenticationError, RateLimitError) as e:
                raise
            except Exception as e:
                last_exception = e
                logger.error(f"Unexpected error on attempt {attempt + 1}: {str(e)}")

            if attempt < self.max_retries - 1:
                sleep_time = self.backoff_factor * (2 ** attempt)
                logger.info(f"Retrying in {sleep_time} seconds...")
                time.sleep(sleep_time)

        raise last_exception or APIError("所有重试尝试均失败")



class ChatGPTClient(BaseAPIClient):
    """ChatGPT API 客户端"""

    def __init__(self, api_key: str, temperature: float = 0.2):
        super().__init__(
            api_key=api_key,
            base_url="https://api.openai.com/v1",
            model="gpt-4",
            temperature=temperature
        )

    def get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def process_response(self, response: requests.Response) -> str:
        data = response.json()
        return data['choices'][0]['message']['content']

    def prepare_chat_payload(
            self,
            prompt: str,
            temperature: Optional[float] = None,
            **kwargs
    ) -> Dict[str, Any]:
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}]
        }
        if temperature is not None:
            payload["temperature"] = temperature
        return payload

class ClaudeClient(BaseAPIClient):
    """Claude API 客户端"""

    def __init__(self, api_key: str, temperature: float = 0.2):
        super().__init__(
            api_key=api_key,
            base_url="https://api.anthropic.com/v1",
            model="claude-3-sonnet-20240229",
            temperature=temperature
        )

    def get_headers(self) -> Dict[str, str]:
        return {
            "anthropic-version": "2023-06-01",
            "x-api-key": self.api_key,
            "content-type": "application/json"
        }

    def process_response(self, response: requests.Response) -> str:
        data = response.json()
        return data['content'][0]['text']

    def prepare_chat_payload(
            self,
            prompt: str,
            temperature: Optional[float] = None,
            **kwargs
    ) -> Dict[str, Any]:
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}]
        }
        if temperature is not None:
            payload["temperature"] = temperature
        return payload


class GLMClient(BaseAPIClient):
    """智谱 API 客户端"""

    def __init__(self, api_key: str, temperature: float = 0.2):
        super().__init__(
            api_key=api_key,
            base_url="https://open.bigmodel.cn/api/paas/v4",
            model="glm-4-plus",
            temperature=temperature
        )

    def get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def process_response(self, response: requests.Response) -> str:
        data = response.json()
        return data['choices'][0]['message']['content']

    def prepare_chat_payload(
            self,
            prompt: str,
            temperature: Optional[float] = None,
            **kwargs
    ) -> Dict[str, Any]:
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}]
        }
        if temperature is not None:
            payload["temperature"] = temperature
        return payload


def create_client(
        model_type: str,
        api_key: str,
        temperature: float = 0.2
) -> BaseAPIClient:
    """创建对应的客户端实例"""
    clients = {
        "qwen": QwenClient,
        "chatgpt": ChatGPTClient,
        "claude": ClaudeClient,
        "glm": GLMClient
    }

    if model_type not in clients:
        raise ValueError(f"不支持的模型类型: {model_type}")

    try:
        return clients[model_type](api_key, temperature=temperature)
    except Exception as e:
        logger.error(f"Failed to create client for {model_type}: {str(e)}")
        raise


def verify_api_key(model_type: str, api_key: str) -> Tuple[bool, str]:
    """验证 API 密钥"""
    try:
        logger.info(f"Verifying API key for {model_type}")
        client = create_client(model_type, api_key)
        response = client.chat("测试消息")
        logger.info(f"API key verification successful for {model_type}")
        return True, "API密钥验证成功"
    except AuthenticationError as e:
        logger.error(f"Authentication error for {model_type}: {str(e)}")
        return False, str(e)
    except RateLimitError as e:
        logger.error(f"Rate limit error for {model_type}: {str(e)}")
        return False, str(e)
    except Exception as e:
        logger.error(f"Verification failed for {model_type}: {str(e)}")
        return False, f"验证失败: {str(e)}"