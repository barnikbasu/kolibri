import hashlib
from unittest.mock import MagicMock
from unittest.mock import patch

from django.test import TestCase

from kolibri.core.content.models import LocalFile
from kolibri.core.content.utils.paths import get_zip_content_config
from kolibri.core.content.utils.paths import resolve_channel_token
from kolibri.core.discovery.utils.network.errors import NetworkLocationResponseFailure
from kolibri.utils.tests.helpers import override_option


class LocalFilePathsTest(TestCase):
    def test_file_url_reversal(self):
        from kolibri.utils.conf import OPTIONS

        path_prefix = OPTIONS["Deployment"]["URL_PATH_PREFIX"]

        if path_prefix != "/":
            path_prefix = "/" + path_prefix

        self.hash = hashlib.md5("DUMMYDATA".encode()).hexdigest()
        file = LocalFile(id=self.hash, extension="otherextension", available=True)
        filename = file.get_filename()
        self.assertEqual(
            file.get_storage_url(),
            "{}content/storage/{}/{}/{}".format(
                path_prefix, filename[0], filename[1], filename
            ),
        )


@override_option("Deployment", "URL_PATH_PREFIX", "prefix_test/")
class PrefixedLocalFilesPathsTest(LocalFilePathsTest):
    pass


class ZipContentConfigTest(TestCase):
    @override_option("Deployment", "ZIP_CONTENT_ORIGIN", "https://kolibri.example.com")
    def test_zip_content_origin_set(self):
        zip_content_origin, zip_content_port = get_zip_content_config()
        self.assertEqual("https://kolibri.example.com", zip_content_origin)
        self.assertEqual(zip_content_port, "")


class ResolveChannelTokenTest(TestCase):
    """Test the resolve_channel_token utility function"""

    @patch("kolibri.core.content.utils.paths.NetworkClient")
    def test_resolve_valid_token(self, mock_network_client_class):
        """Test successful token resolution"""
        # Setup mock response
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {
                "id": "aa480b60a7f4526f886e7df9f4e9b8ca",
                "name": "Test Channel",
                "description": "A test channel",
            }
        ]
        mock_client.get.return_value = mock_response
        mock_network_client_class.build_for_address.return_value = mock_client

        # Test token resolution
        channel_id, all_channels = resolve_channel_token("test-token", baseurl="https://studio.example.com")

        # Verify the result
        self.assertEqual(channel_id, "aa480b60a7f4526f886e7df9f4e9b8ca")
        self.assertEqual(len(all_channels), 1)
        self.assertEqual(all_channels[0]["id"], "aa480b60a7f4526f886e7df9f4e9b8ca")
        mock_client.get.assert_called_once()

    @patch("kolibri.core.content.utils.paths.NetworkClient")
    def test_resolve_token_not_found(self, mock_network_client_class):
        """Test token that doesn't exist on the server"""
        # Setup mock response with empty list
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.json.return_value = []
        mock_client.get.return_value = mock_response
        mock_network_client_class.build_for_address.return_value = mock_client

        # Test that it raises NetworkLocationResponseFailure
        with self.assertRaises(NetworkLocationResponseFailure):
            resolve_channel_token("invalid-token", baseurl="https://studio.example.com")

    @patch("kolibri.core.content.utils.paths.NetworkClient")
    def test_resolve_token_missing_id(self, mock_network_client_class):
        """Test response with missing channel ID"""
        # Setup mock response with channel but no ID
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {
                "name": "Test Channel",
                "description": "A test channel",
            }
        ]
        mock_client.get.return_value = mock_response
        mock_network_client_class.build_for_address.return_value = mock_client

        # Test that it raises ValueError
        with self.assertRaises(ValueError) as context:
            resolve_channel_token("test-token", baseurl="https://studio.example.com")

        self.assertIn("missing channel ID", str(context.exception))

    @patch("kolibri.core.content.utils.paths.NetworkClient")
    def test_resolve_token_with_default_baseurl(self, mock_network_client_class):
        """Test token resolution with default Studio URL"""
        # Setup mock response
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {
                "id": "bb480b60a7f4526f886e7df9f4e9b8cb",
                "name": "Test Channel",
            }
        ]
        mock_client.get.return_value = mock_response
        mock_network_client_class.build_for_address.return_value = mock_client

        # Test token resolution without explicit baseurl
        channel_id, all_channels = resolve_channel_token("test-token")

        # Verify the result
        self.assertEqual(channel_id, "bb480b60a7f4526f886e7df9f4e9b8cb")
        self.assertEqual(len(all_channels), 1)
        # Verify it was called with Studio URL
        mock_network_client_class.build_for_address.assert_called_once()

    @patch("kolibri.core.content.utils.paths.NetworkClient")
    def test_resolve_token_multiple_channels(self, mock_network_client_class):
        """Test token that resolves to multiple channels"""
        # Setup mock response with multiple channels
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {
                "id": "aa480b60a7f4526f886e7df9f4e9b8ca",
                "name": "Channel A",
                "description": "First channel",
            },
            {
                "id": "bb480b60a7f4526f886e7df9f4e9b8cb",
                "name": "Channel B",
                "description": "Second channel",
            },
        ]
        mock_client.get.return_value = mock_response
        mock_network_client_class.build_for_address.return_value = mock_client

        # Test token resolution
        channel_id, all_channels = resolve_channel_token("test-token", baseurl="https://studio.example.com")

        # Verify returns first channel but includes all
        self.assertEqual(channel_id, "aa480b60a7f4526f886e7df9f4e9b8ca")
        self.assertEqual(len(all_channels), 2)
        self.assertEqual(all_channels[0]["id"], "aa480b60a7f4526f886e7df9f4e9b8ca")
        self.assertEqual(all_channels[1]["id"], "bb480b60a7f4526f886e7df9f4e9b8cb")

    @patch("kolibri.core.content.utils.paths.NetworkClient")
    def test_resolve_token_invalid_json(self, mock_network_client_class):
        """Test server returning invalid JSON"""
        # Setup mock response that raises when parsing JSON
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.json.side_effect = ValueError("Invalid JSON")
        mock_client.get.return_value = mock_response
        mock_network_client_class.build_for_address.return_value = mock_client

        # Test that it raises ValueError with helpful message
        with self.assertRaises(ValueError) as context:
            resolve_channel_token("test-token", baseurl="https://studio.example.com")

        self.assertIn("Server returned invalid response", str(context.exception))
        self.assertIn("expected JSON", str(context.exception))
