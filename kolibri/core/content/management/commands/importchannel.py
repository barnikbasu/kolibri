import logging

from django.core.management.base import CommandError

from ...utils import paths
from kolibri.core.content.constants.transfer_types import COPY_METHOD
from kolibri.core.content.constants.transfer_types import DOWNLOAD_METHOD
from kolibri.core.content.utils.channel_transfer import transfer_channel
from kolibri.core.content.utils.paths import resolve_channel_token
from kolibri.core.discovery.utils.network.errors import (
    NetworkLocationConnectionFailure,
    NetworkLocationNotFound,
    NetworkLocationResponseFailure,
)
from kolibri.core.tasks.management.commands.base import AsyncCommand
from kolibri.utils import conf
from kolibri.utils.uuids import is_valid_uuid

logger = logging.getLogger(__name__)


class Command(AsyncCommand):
    def add_arguments(self, parser):
        # let's save the parser in case we need to print a help statement
        self._parser = parser

        # see `importcontent` management command for explanation of how we're using subparsers
        subparsers = parser.add_subparsers(
            dest="command", help="The following subcommands are available."
        )

        network_subparser = subparsers.add_parser(
            "network",
            help="Download the given channel through the network.",
        )
        network_subparser.add_argument(
            "channel_id",
            type=str,
            help="Download the database for the given channel_id or channel token. "
            "Tokens are resolved by querying the content server (e.g., Kolibri Studio).",
        )

        default_studio_url = conf.OPTIONS["Urls"]["CENTRAL_CONTENT_BASE_URL"]
        network_subparser.add_argument(
            "--baseurl",
            type=str,
            default=default_studio_url,
            help="The host we will download the content from. Defaults to {}".format(
                default_studio_url
            ),
        )
        network_subparser.add_argument(
            "--no_upgrade",
            action="store_true",
            help="Only download database to an upgrade file path.",
        )
        network_subparser.add_argument(
            "--content_dir",
            type=str,
            default=paths.get_content_dir_path(),
            help="Download the database to the given content dir.",
        )

        local_subparser = subparsers.add_parser(
            "disk", help="Copy the content from the given folder."
        )
        local_subparser.add_argument(
            "channel_id",
            type=str,
            help="Import this channel id from the given directory. "
            "Note: Only channel IDs (UUIDs) are accepted, not tokens.",
        )
        local_subparser.add_argument(
            "directory", type=str, help="Import content from this directory."
        )
        local_subparser.add_argument(
            "--no_upgrade",
            action="store_true",
            help="Only download database to an upgrade file path.",
        )
        local_subparser.add_argument(
            "--content_dir",
            type=str,
            default=paths.get_content_dir_path(),
            help="Download the database to the given content dir.",
        )

    def _prompt_channel_choice(self, channels):
        """
        Prompt the user to choose from multiple channels.

        :param channels: List of channel dicts from the server
        :return: Selected channel ID
        """
        import sys

        self.stdout.write("\nMultiple channels found for this token:\n")
        for idx, channel in enumerate(channels, 1):
            self.stdout.write(
                "  {}. {} (ID: {})\n     {}\n".format(
                    idx,
                    channel.get("name", "Unnamed Channel"),
                    channel["id"],
                    channel.get("description", "No description")[:100],
                )
            )

        while True:
            try:
                self.stdout.write("\nEnter the number of the channel to import (1-{}): ".format(len(channels)))
                self.stdout.flush()
                choice = sys.stdin.readline().strip()
                choice_num = int(choice)
                if 1 <= choice_num <= len(channels):
                    selected = channels[choice_num - 1]
                    self.stdout.write(
                        "Selected: {} ({})\n".format(
                            selected.get("name", "Unnamed"), selected["id"]
                        )
                    )
                    return selected["id"]
                else:
                    self.stdout.write(
                        "Invalid choice. Please enter a number between 1 and {}.\n".format(
                            len(channels)
                        )
                    )
            except (ValueError, KeyboardInterrupt):
                raise CommandError("Channel selection cancelled")

    def _is_interactive(self):
        """Check if running in an interactive terminal."""
        import sys
        return sys.stdin.isatty() and sys.stdout.isatty()

    def _resolve_channel_identifier(self, identifier, baseurl):
        """
        Resolve a channel identifier (channel_id or token) to a channel_id.

        :param identifier: Either a channel UUID or a channel token
        :param baseurl: The base URL of the content server
        :return: The resolved channel_id
        :raises: CommandError if token resolution fails
        """
        # Check if the identifier is already a valid UUID (channel_id)
        if is_valid_uuid(identifier):
            logger.info("Using channel ID: {}".format(identifier))
            return identifier

        # Otherwise, treat it as a token and try to resolve it
        logger.info("Resolving channel token '{}'...".format(identifier))
        try:
            channel_id, all_channels = resolve_channel_token(identifier, baseurl=baseurl)

            # Handle case where multiple channels are returned
            if len(all_channels) > 1:
                logger.warning(
                    "Token '{}' resolved to {} channels".format(
                        identifier, len(all_channels)
                    )
                )

                if self._is_interactive():
                    # Interactive mode: prompt user to choose
                    channel_id = self._prompt_channel_choice(all_channels)
                else:
                    # Non-interactive mode: show error with all options
                    error_msg = (
                        "Token '{}' resolved to multiple channels. "
                        "Please use a specific channel ID instead:\n".format(identifier)
                    )
                    for channel in all_channels:
                        error_msg += "  - {} (ID: {})\n".format(
                            channel.get("name", "Unnamed Channel"), channel["id"]
                        )
                    raise CommandError(error_msg)

            logger.info(
                "Successfully resolved token '{}' to channel ID: {}".format(
                    identifier, channel_id
                )
            )
            return channel_id
        except NetworkLocationConnectionFailure:
            raise CommandError(
                "Failed to connect to content server at '{}'. "
                "Please check your network connection and try again.".format(
                    baseurl or "Kolibri Studio"
                )
            )
        except NetworkLocationNotFound:
            raise CommandError(
                "Content server not found at '{}'. "
                "Please check the URL and try again.".format(
                    baseurl or "Kolibri Studio"
                )
            )
        except NetworkLocationResponseFailure as e:
            raise CommandError(
                "Token '{}' not found on content server. "
                "Please verify the token is correct. Error: {}".format(identifier, e)
            )
        except ValueError as e:
            raise CommandError("Invalid token or channel ID: {}".format(e))
        except Exception as e:
            logger.error(
                "Unexpected error resolving token '{}': {}".format(identifier, e)
            )
            raise CommandError(
                "Failed to resolve token '{}'. Error: {}".format(identifier, e)
            )

    def download_channel(self, channel_id, baseurl, no_upgrade, content_dir):
        # Resolve the identifier (could be channel_id or token)
        resolved_channel_id = self._resolve_channel_identifier(channel_id, baseurl)

        logger.info("Downloading data for channel id {}".format(resolved_channel_id))
        transfer_channel(
            channel_id=resolved_channel_id,
            method=DOWNLOAD_METHOD,
            no_upgrade=no_upgrade,
            content_dir=content_dir,
            baseurl=baseurl,
        )

    def copy_channel(self, channel_id, source_path, no_upgrade, content_dir):
        # For disk imports, only accept valid UUIDs (not tokens)
        if not is_valid_uuid(channel_id):
            raise CommandError(
                "Invalid channel ID: '{}'. The 'disk' subcommand only accepts "
                "channel IDs (UUIDs), not tokens. Tokens are only supported for "
                "network imports using the 'network' subcommand.".format(channel_id)
            )

        logger.info("Copying in data for channel id {}".format(channel_id))
        transfer_channel(
            channel_id=channel_id,
            method=COPY_METHOD,
            no_upgrade=no_upgrade,
            content_dir=content_dir,
            source_path=source_path,
        )

    def handle_async(self, *args, **options):
        if options["command"] == "network":
            self.download_channel(
                options["channel_id"],
                options["baseurl"],
                options["no_upgrade"],
                options["content_dir"],
            )
        elif options["command"] == "disk":
            self.copy_channel(
                options["channel_id"],
                options["directory"],
                options["no_upgrade"],
                options["content_dir"],
            )
        else:
            self._parser.print_help()
            raise CommandError(
                "Please give a valid subcommand. You gave: {}".format(
                    options["command"]
                )
            )
